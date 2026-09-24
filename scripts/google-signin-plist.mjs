/**
 * Pure GoogleService-Info.plist / Info.plist helpers for Google Sign-In.
 * Never invents CLIENT_ID / REVERSED_CLIENT_ID.
 */

export function plistString(xml, key) {
  const re = new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`, "i");
  const m = xml.match(re);
  return m?.[1]?.trim() || "";
}

export function setPlistString(xml, key, value) {
  const re = new RegExp(`(<key>${key}</key>\\s*<string>)[^<]*(</string>)`, "i");
  if (re.test(xml)) return xml.replace(re, `$1${value}$2`);
  return xml.replace(
    /<\/dict>\s*<\/plist>\s*$/i,
    `    <key>${key}</key>\n    <string>${value}</string>\n</dict>\n</plist>\n`,
  );
}

export function ensureReversedClientUrlScheme(xml, reversedClientId) {
  if (xml.includes(`<string>${reversedClientId}</string>`)) return xml;
  const extra = `		<dict>
			<key>CFBundleURLName</key>
			<string>google-reversed-client-id</string>
			<key>CFBundleURLSchemes</key>
			<array>
				<string>${reversedClientId}</string>
			</array>
		</dict>
`;
  if (xml.includes("<key>CFBundleURLTypes</key>")) {
    return xml.replace(
      /<key>CFBundleURLTypes<\/key>\s*<array>/,
      `<key>CFBundleURLTypes</key>\n	<array>\n${extra}`,
    );
  }
  return xml.replace(
    /<\/dict>\s*<\/plist>\s*$/i,
    `	<key>CFBundleURLTypes</key>
	<array>
${extra}	</array>
</dict>
</plist>
`,
  );
}

export function applyGoogleSignInKeys(infoXml, clientId, reversedClientId) {
  let info = setPlistString(infoXml, "GIDClientID", clientId);
  return ensureReversedClientUrlScheme(info, reversedClientId);
}

export const SAMPLE_GOOGLE_SERVICE_INFO_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CLIENT_ID</key>
	<string>123456789-abcdef.apps.googleusercontent.com</string>
	<key>REVERSED_CLIENT_ID</key>
	<string>com.googleusercontent.apps.123456789-abcdef</string>
	<key>GOOGLE_APP_ID</key>
	<string>1:123456789:ios:abc</string>
	<key>API_KEY</key>
	<string>AIzaSyDummyKeyForFormatTestsOnly</string>
	<key>GCM_SENDER_ID</key>
	<string>123456789</string>
	<key>BUNDLE_ID</key>
	<string>com.confast.essences</string>
</dict>
</plist>
`;
