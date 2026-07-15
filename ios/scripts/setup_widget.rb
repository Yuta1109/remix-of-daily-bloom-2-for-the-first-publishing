#!/usr/bin/env ruby
# frozen_string_literal: true

# Idempotently wires the Essentials Live Activity into the Capacitor iOS project:
#   * adds the ActivityKit plugin + shared attributes to the App target
#   * creates the "EssentialsWidget" widget-extension target (iOS 16.1+)
#   * embeds the widget extension into the app
#
# Run from the `ios/App` directory:
#   gem install xcodeproj
#   ruby ../scripts/setup_widget.rb
#
# Safe to run repeatedly; existing wiring is detected and skipped.

require "xcodeproj"

APP_NAME = "App"
WIDGET_NAME = "EssentialsWidget"
APP_BUNDLE_ID = "com.confast.essences"
# Lowercase suffix — Apple Developer Portal rejects some mixed-case IDs.
WIDGET_BUNDLE_ID = "com.confast.essences.widget"
DEPLOYMENT_TARGET = "16.1"
SWIFT_VERSION = "5.0"

project_path = File.expand_path("App.xcodeproj", Dir.pwd)
abort("Cannot find #{project_path}") unless File.exist?(project_path)

project = Xcodeproj::Project.open(project_path)
app_target = project.targets.find { |t| t.name == APP_NAME }
abort("App target not found") unless app_target

# --- Enforce deployment target everywhere -----------------------------------
(project.build_configurations + app_target.build_configurations).each do |cfg|
  cfg.build_settings["IPHONEOS_DEPLOYMENT_TARGET"] = DEPLOYMENT_TARGET
end

# --- Helper: find or create a file reference under a group ------------------
def ref_for(project, group, absolute_path, relative_name)
  existing = project.files.find { |f| f.real_path.to_s == absolute_path.to_s }
  return existing if existing

  group.new_reference(relative_name)
end

app_group = project.main_group[APP_NAME] || project.main_group.new_group(APP_NAME, APP_NAME)

# --- 1. Add plugin + shared attributes to the App target --------------------
la_group = app_group["LiveActivities"] || app_group.new_group("LiveActivities", "LiveActivities")

attributes_path = File.expand_path("App/LiveActivities/EssentialsAttributes.swift", Dir.pwd)
plugin_path = File.expand_path("App/LiveActivities/LiveActivitiesPlugin.swift", Dir.pwd)

attributes_ref = ref_for(project, la_group, attributes_path, "EssentialsAttributes.swift")
plugin_ref = ref_for(project, la_group, plugin_path, "LiveActivitiesPlugin.swift")

app_sources = app_target.source_build_phase
[attributes_ref, plugin_ref].each do |ref|
  next if app_sources.files_references.include?(ref)

  app_sources.add_file_reference(ref)
end

# --- 2. Create the widget extension target ----------------------------------
widget_target = project.targets.find { |t| t.name == WIDGET_NAME }

unless widget_target
  widget_target = project.new_target(
    :app_extension,
    WIDGET_NAME,
    :ios,
    DEPLOYMENT_TARGET
  )
end

widget_target.build_configurations.each do |cfg|
  bs = cfg.build_settings
  bs["PRODUCT_BUNDLE_IDENTIFIER"] = WIDGET_BUNDLE_ID
  bs["PRODUCT_NAME"] = "$(TARGET_NAME)"
  bs["INFOPLIST_FILE"] = "#{WIDGET_NAME}/Info.plist"
  bs["IPHONEOS_DEPLOYMENT_TARGET"] = DEPLOYMENT_TARGET
  bs["SWIFT_VERSION"] = SWIFT_VERSION
  bs["TARGETED_DEVICE_FAMILY"] = "1,2"
  bs["CODE_SIGN_STYLE"] = "Automatic"
  bs["GENERATE_INFOPLIST_FILE"] = "NO"
  bs["SKIP_INSTALL"] = "YES"
  bs["CURRENT_PROJECT_VERSION"] = "1"
  bs["MARKETING_VERSION"] = "1.0"
  bs["LD_RUNPATH_SEARCH_PATHS"] = [
    "$(inherited)",
    "@executable_path/Frameworks",
    "@executable_path/../../Frameworks",
  ]
end

# --- 3. Widget source files -------------------------------------------------
widget_group = project.main_group[WIDGET_NAME] || project.main_group.new_group(WIDGET_NAME, WIDGET_NAME)

bundle_path = File.expand_path("#{WIDGET_NAME}/EssentialsWidgetBundle.swift", Dir.pwd)
live_path = File.expand_path("#{WIDGET_NAME}/EssentialsWidgetLiveActivity.swift", Dir.pwd)

bundle_ref = ref_for(project, widget_group, bundle_path, "EssentialsWidgetBundle.swift")
live_ref = ref_for(project, widget_group, live_path, "EssentialsWidgetLiveActivity.swift")

widget_sources = widget_target.source_build_phase
# The shared attributes file is compiled into the widget too.
[bundle_ref, live_ref, attributes_ref].each do |ref|
  next if widget_sources.files_references.include?(ref)

  widget_sources.add_file_reference(ref)
end

# Ensure the widget Info.plist reference exists in the group (not compiled).
unless project.files.any? { |f| f.real_path.to_s == File.expand_path("#{WIDGET_NAME}/Info.plist", Dir.pwd).to_s }
  widget_group.new_reference("Info.plist")
end

# --- 4. Frameworks the widget links against ---------------------------------
%w[WidgetKit SwiftUI].each do |fw|
  already = widget_target.frameworks_build_phase.files.any? do |bf|
    bf.display_name == "#{fw}.framework"
  end
  widget_target.add_system_framework(fw) unless already
end

# --- 5. Embed the widget extension into the app -----------------------------
app_target.add_dependency(widget_target)

embed_phase = app_target.copy_files_build_phases.find { |p| p.name == "Embed App Extensions" }
unless embed_phase
  embed_phase = app_target.new_copy_files_build_phase("Embed App Extensions")
  embed_phase.symbol_dst_subfolder_spec = :plug_ins # PlugIns (spec 13)
end

appex_ref = widget_target.product_reference
already_embedded = embed_phase.files_references.include?(appex_ref)
unless already_embedded
  build_file = embed_phase.add_file_reference(appex_ref)
  build_file.settings = { "ATTRIBUTES" => ["RemoveHeadersOnCopy"] }
end

project.save
puts "EssencesWidget wiring complete."
