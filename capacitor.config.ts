import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.confast.essences",
  appName: "Essences",
  webDir: "dist",
  ios: {
    // Handle safe areas in CSS only — "always" double-counted insets and caused
    // intermittent black bars + oversized bottom gaps on notched iPhones.
    contentInset: "never",
    // Exclude @capacitor-firebase/app: its folder basename "app" collides with
    // @capacitor/app in SwiftPM ("Conflicting identity for app"). Messaging
    // configures FirebaseCore itself when GoogleService-Info.plist is present.
    includePlugins: [
      "@capacitor-firebase/messaging",
      "@capacitor/app",
      "@capacitor/haptics",
      "@capacitor/keyboard",
      "@capacitor/local-notifications",
      "@capacitor/splash-screen",
      "@capacitor/status-bar",
      "capacitor-native-settings",
    ],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: "#faf8f5",
      showSpinner: false,
    },
    LocalNotifications: {
      smallIcon: "ic_stat_icon",
    },
    Keyboard: {
      // Do not resize the WebView — we lift #root ourselves so the whole UI
      // (including the focused field) moves above the keyboard together.
      resize: "none",
      resizeOnFullScreen: false,
    },
    FirebaseMessaging: {
      // Live Activity pushes are silent to the banner; empty keeps alerts quiet.
      presentationOptions: [],
    },
  },
};

export default config;