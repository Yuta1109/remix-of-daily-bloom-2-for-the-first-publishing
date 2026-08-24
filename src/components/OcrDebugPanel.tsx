import { useEffect, useState } from "react";
import { Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";
import { useI18n } from "@/lib/i18n";
import { copyText } from "@/lib/copy-text";
import {
  clearOcrDebugLog,
  formatOcrDebugLogForCopy,
  getOcrDebugLog,
  subscribeOcrDebugLog,
  type OcrDebugEntry,
} from "@/lib/ocr-debug-log";
import { buildOcrDiagnosticHeader, probeOcrEnvironment } from "@/lib/ocr-diagnostics";

type Props = {
  className?: string;
};

export function OcrDebugPanel({ className }: Props) {
  const { t } = useI18n();
  const [entries, setEntries] = useState<readonly OcrDebugEntry[]>(() => getOcrDebugLog());

  useEffect(() => {
    void probeOcrEnvironment("settings-open");
    return subscribeOcrDebugLog(() => setEntries([...getOcrDebugLog()]));
  }, []);

  const handleCopy = async () => {
    const header = await buildOcrDiagnosticHeader();
    const text = formatOcrDebugLogForCopy(header);
    const ok = await copyText(text);
    toast(ok ? t("ocrDebugCopied") : t("ocrDebugCopyFailed"));
  };

  const handleClear = () => {
    clearOcrDebugLog();
    toast(t("ocrDebugCleared"));
  };

  return (
    <div className={className}>
      <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{t("ocrDebugHint")}</p>
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-accent text-accent-foreground py-2.5 text-sm font-medium"
        >
          <Copy className="w-4 h-4" />
          {t("ocrDebugCopy")}
        </button>
        <button
          type="button"
          onClick={handleClear}
          className="rounded-xl bg-secondary px-4 py-2.5 text-sm text-muted-foreground"
          aria-label={t("ocrDebugClear")}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <div className="rounded-xl bg-secondary/40 border border-border/50 max-h-48 overflow-y-auto p-3 font-mono text-[10px] leading-relaxed text-muted-foreground whitespace-pre-wrap break-all">
        {entries.length === 0 ? (
          <span>{t("ocrDebugEmpty")}</span>
        ) : (
          entries
            .slice(-80)
            .map((e) => {
              const time = new Date(e.at).toISOString().slice(11, 23);
              return `${time} [${e.level}] ${e.source}: ${e.message}`;
            })
            .join("\n")
        )}
      </div>
      {!Capacitor.isNativePlatform() ? (
        <p className="text-[10px] text-muted-foreground mt-2">{t("ocrDebugWebNote")}</p>
      ) : null}
    </div>
  );
}
