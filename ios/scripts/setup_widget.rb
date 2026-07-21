#!/usr/bin/env ruby
# frozen_string_literal: true

# Idempotently wires the Essentials Live Activity into the Capacitor iOS project:
#   * adds the ActivityKit plugin + shared attributes to the App target
#   * creates the "EssentialsWidget" widget-extension target (iOS 17.2+)
#   * embeds the widget extension into the app
#   * sets CODE_SIGN_ENTITLEMENTS for the main app
#
# Run from the `ios/App` directory:
#   gem install xcodeproj
#   ruby ../scripts/setup_widget.rb
#
# Safe to run repeatedly; existing wiring is detected and skipped.
#
# iOS 17.2+ is required for ActivityKit push-to-start (start Live Activities
# while the app is killed, via APNs / Firebase).

require "xcodeproj"
require "json"

APP_NAME = "App"
WIDGET_NAME = "EssentialsWidget"
APP_BUNDLE_ID = "com.confast.essences"
# Lowercase suffix — Apple Developer Portal rejects some mixed-case IDs.
WIDGET_BUNDLE_ID = "com.confast.essences.widget"
DEPLOYMENT_TARGET = "17.2"
SWIFT_VERSION = "5.0"

project_path = File.expand_path("App.xcodeproj", Dir.pwd)
abort("Cannot find #{project_path}") unless File.exist?(project_path)

project = Xcodeproj::Project.open(project_path)
app_target = project.targets.find { |t| t.name == APP_NAME }
abort("App target not found") unless app_target

# --- Enforce deployment target everywhere -----------------------------------
(project.build_configurations + app_target.build_configurations).each do |cfg|
  cfg.build_settings["IPHONEOS_DEPLOYMENT_TARGET"] = DEPLOYMENT_TARGET
  cfg.build_settings["CODE_SIGN_ENTITLEMENTS"] = "#{APP_NAME}/App.entitlements"
end

# --- Helper: find or create a file reference under a group ------------------
def ref_for(project, group, absolute_path, relative_name)
  existing = project.files.find { |f| f.real_path.to_s == absolute_path.to_s }
  return existing if existing

  group.new_reference(relative_name)
end

app_group = project.main_group[APP_NAME] || project.main_group.new_group(APP_NAME, APP_NAME)

# --- Entitlements file reference (not compiled) -----------------------------
entitlements_path = File.expand_path("App/App.entitlements", Dir.pwd)
unless project.files.any? { |f| f.real_path.to_s == entitlements_path.to_s }
  app_group.new_reference("App.entitlements")
end

# --- 1. Add plugin + shared attributes to the App target --------------------
la_group = app_group["LiveActivities"] || app_group.new_group("LiveActivities", "LiveActivities")

attributes_path = File.expand_path("App/LiveActivities/EssentialsAttributes.swift", Dir.pwd)
plugin_path = File.expand_path("App/LiveActivities/LiveActivitiesPlugin.swift", Dir.pwd)
token_center_path = File.expand_path("App/LiveActivities/LiveActivityPushTokenCenter.swift", Dir.pwd)
refresh_center_path = File.expand_path("App/LiveActivities/LiveActivityRefreshCenter.swift", Dir.pwd)

attributes_ref = ref_for(project, la_group, attributes_path, "EssentialsAttributes.swift")
plugin_ref = ref_for(project, la_group, plugin_path, "LiveActivitiesPlugin.swift")
token_center_ref = ref_for(project, la_group, token_center_path, "LiveActivityPushTokenCenter.swift")
refresh_center_ref = ref_for(project, la_group, refresh_center_path, "LiveActivityRefreshCenter.swift")

app_sources = app_target.source_build_phase
[attributes_ref, plugin_ref, token_center_ref, refresh_center_ref].each do |ref|
  next if app_sources.files_references.include?(ref)

  app_sources.add_file_reference(ref)
end

# --- ActivityKit on the main app target -------------------------------------
%w[ActivityKit].each do |fw|
  already = app_target.frameworks_build_phase.files.any? do |bf|
    bf.display_name == "#{fw}.framework"
  end
  app_target.add_system_framework(fw) unless already
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
%w[WidgetKit SwiftUI ActivityKit].each do |fw|
  already = widget_target.frameworks_build_phase.files.any? do |bf|
    bf.display_name == "#{fw}.framework"
  end
  widget_target.add_system_framework(fw) unless already
end

# --- 5. Embed the widget extension into the app -----------------------------
unless app_target.dependencies.any? { |d| d.target == widget_target }
  app_target.add_dependency(widget_target)
end

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

# --- GoogleService-Info.plist (CI secret or local) ---------------------------
# Always wire into Copy Bundle Resources so the IPA includes it when the file
# exists at archive time. Writing the file AFTER this script used to leave it
# off the target → FirebaseMessaging.configure() crashed on every launch.
plist_path = File.expand_path("App/GoogleService-Info.plist", Dir.pwd)
plist_ref = project.files.find { |f| f.path.to_s.end_with?("GoogleService-Info.plist") }
unless plist_ref
  plist_ref = app_group.new_reference("GoogleService-Info.plist")
end
resources = app_target.resources_build_phase
unless resources.files_references.include?(plist_ref)
  resources.add_file_reference(plist_ref)
end
if File.exist?(plist_path)
  puts "Bundled GoogleService-Info.plist into App target."
else
  puts "WARNING: GoogleService-Info.plist not on disk yet — wired in Xcode; write the file before archive."
end

project.save
puts "EssencesWidget wiring complete."

# --- Register in-app Capacitor plugin (not an npm package) -------------------
# Capacitor 8 only loads classes listed in capacitor.config.json packageClassList.
# `cap sync` fills that list from node_modules plugins and never sees App/*.swift,
# so without this step JS gets: "LiveActivities" plugin is not implemented on ios.
cap_json_path = File.expand_path("App/capacitor.config.json", Dir.pwd)
if File.exist?(cap_json_path)
  cap_json = JSON.parse(File.read(cap_json_path))
  class_list = Array(cap_json["packageClassList"])
  # In-app plugin + Firebase plugins required for FCM / remote Live Activity.
  required_plugins = %w[
    LiveActivitiesPlugin
    FirebaseMessagingPlugin
    AppPlugin
  ]
  added = []
  required_plugins.each do |name|
    next if class_list.include?(name)

    class_list << name
    added << name
  end
  if added.any?
    cap_json["packageClassList"] = class_list
    File.write(cap_json_path, JSON.pretty_generate(cap_json) + "\n")
    puts "Registered in packageClassList: #{added.join(', ')}"
  else
    puts "Capacitor packageClassList already has Live Activities + Firebase plugins."
  end
else
  puts "WARNING: #{cap_json_path} missing — run npx cap sync ios first."
end

# Fail loudly if Firebase Messaging never made it into CapApp-SPM (common when
# experimental SPM symlink options fail with EPERM and abort Package.swift write).
# cwd is ios/App (see workflow working-directory), so CapApp-SPM sits next to App/.
package_swift = File.expand_path("CapApp-SPM/Package.swift", Dir.pwd)
unless File.exist?(package_swift)
  abort "ERROR: #{package_swift} missing — run npx cap sync ios first."
end
pkg = File.read(package_swift)
%w[CapacitorFirebaseMessaging].each do |name|
  next if pkg.include?(name)

  abort <<~MSG
    ERROR: #{name} is missing from CapApp-SPM/Package.swift.
    FCM / Live Activity push tokens will stay null on device.
    Run: npx cap sync ios && node scripts/ensure-spm-firebase-app-link.mjs
  MSG
end
unless pkg.include?("VendoredAppPlugin")
  abort "ERROR: CapApp-SPM must vendor AppPlugin as VendoredAppPlugin (no /app package path)."
end
if pkg.match(%r{path:\s*"[^"]*/app"}) || pkg.include?("node_modules/@capacitor/app")
  abort <<~MSG
    ERROR: Package.swift still references a path ending in /app.
    Run: node scripts/ensure-spm-firebase-app-link.mjs
  MSG
end
puts "Verified CapApp-SPM uses VendoredAppPlugin (no SPM identity app)."
