/** Session-only. Settings remounts on the way back from Privacy, including swipe-back. */
let returnToPrivacyRow = false;

export function markSettingsPrivacyReturn(): void {
  returnToPrivacyRow = true;
}

export function peekSettingsPrivacyReturn(): boolean {
  return returnToPrivacyRow;
}

export function clearSettingsPrivacyReturn(): void {
  returnToPrivacyRow = false;
}
