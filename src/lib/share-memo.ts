import { Capacitor } from "@capacitor/core";
import { htmlToPlainText, type MemoPage } from "./notes-store";

export async function shareMemoPage(page: MemoPage): Promise<boolean> {
  const title = page.title.trim() || "メモ";
  const body = htmlToPlainText(page.html);
  const text = body ? `${title}\n\n${body}` : title;

  if (Capacitor.isNativePlatform()) {
    try {
      const { Share } = await import("@capacitor/share");
      await Share.share({ title, text, dialogTitle: title });
      return true;
    } catch (err) {
      const msg = String((err as Error)?.message || err);
      if (msg.includes("cancel") || msg.includes("abort")) return false;
    }
  }

  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title, text });
      return true;
    } catch (err) {
      const msg = String((err as Error)?.message || err);
      if (msg.includes("abort") || msg.includes("cancel")) return false;
    }
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
