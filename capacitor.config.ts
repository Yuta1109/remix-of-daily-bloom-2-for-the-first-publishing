import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.confast.essences",
  appName: "Essences",
  webDir: "dist",
  ios: {
    // Handle safe areas in CSS only — "always" double-counted insets and caused
    // intermittent black bars + oversized bottom gaps on notched iPhones.
    contentInset: "never",
    // Exclude packages whose npm folder basename is "app" — SwiftPM identity
    // collision under ios/App/CapApp-SPM. @capacitor/app is vendored into
    // CapApp-SPM by scripts/ensure-spm-firebase-app-link.mjs instead.
    includePlugins: [
      "@capacitor-firebase/messaging",
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
      // Keep LaunchScreen (HQ logo only) until the web branding splash is ready.
      // Web splash shows text only — no second logo — so the cut is icon → text.
      launchShowDuration: 30_000,
      launchAutoHide: false,
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