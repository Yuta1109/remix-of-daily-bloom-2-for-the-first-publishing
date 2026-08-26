import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.confast.essences",
  appName: "Essences",
  webDir: "dist",
  // Prevents the black flash when LaunchScreen dismisses: without this, WKWebView
  // uses UIColor.systemBackground (black in Dark Mode) until HTML paints.
  backgroundColor: "#fefefe",
  ios: {
    // Handle safe areas in CSS only — "always" double-counted insets and caused
    // intermittent black bars + oversized bottom gaps on notched iPhones.
    contentInset: "never",
    backgroundColor: "#fefefe",
    // Exclude packages whose npm folder basename is "app" — SwiftPM identity
    // collision under ios/App/CapApp-SPM. @capacitor/app is vendored into
    // CapApp-SPM by scripts/ensure-spm-firebase-app-link.mjs instead.
    includePlugins: [
      "@capacitor-firebase/messaging",
      "@capacitor/camera",
      "@capacitor/haptics",
      "@capacitor/keyboard",
      "@capacitor/local-notifications",
      "@capacitor/share",
      "@capacitor/splash-screen",
      "@capacitor/status-bar",
      "capacitor-native-settings",
    ],
  },
  plugins: {
    SplashScreen: {
      // 0 = do not re-mount LaunchScreen as a Capacitor overlay (avoids second icon).
      launchShowDuration: 0,
      launchAutoHide: true,
      backgroundColor: "#fefefe",
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