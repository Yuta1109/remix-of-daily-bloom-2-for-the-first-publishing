import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.confast.essences",
  appName: "Essences",
  webDir: "dist",
  ios: {
    // Handle safe areas in CSS only — "always" double-counted insets and caused
    // intermittent black bars + oversized bottom gaps on notched iPhones.
    contentInset: "never",
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
  },
};

export default config;
