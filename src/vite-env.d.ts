/// <reference types="vite/client" />

declare module "../../../scripts/google-signin-plist.mjs" {
  export function plistString(xml: string, key: string): string;
  export function setPlistString(xml: string, key: string, value: string): string;
  export function ensureReversedClientUrlScheme(xml: string, reversedClientId: string): string;
  export function applyGoogleSignInKeys(
    infoXml: string,
    clientId: string,
    reversedClientId: string,
  ): string;
  export const SAMPLE_GOOGLE_SERVICE_INFO_PLIST: string;
}
