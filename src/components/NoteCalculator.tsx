import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Op = "+" | "-" | "×" | "÷";

function compute(a: number, b: number, op: Op): number {
  switch (op) {
    case "+":
      return a + b;
    case "-":
      return a - b;
    case "×":
      return a * b;
    case "÷":
      return b === 0 ? NaN : a / b;
  }
}

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return "Error";
  const s = n.toPrecision(12).replace(/\.?0+$/, "");
  return s.length > 14 ? n.toExponential(6) : String(Number(s));
}

interface Props {
  open: boolean;
  onClose: () => void;
  onInsert: (value: string) => void;
}

export function NoteCalculator({ open, onClose, onInsert }: Props) {
  const { t } = useI18n();
  const [display, setDisplay] = useState("0");
  const [acc, setAcc] = useState<number | null>(null);
  const [op, setOp] = useState<Op | null>(null);
  const [fresh, setFresh] = useState(true);
  const [exprLeft, setExprLeft] = useState("");
  const [shownEq, setShownEq] = useState(false);

  const expression = (() => {
    if (shownEq && exprLeft) return `${exprLeft} =`;
    if (op && exprLeft) return exprLeft;
    return "";
  })();

  const reset = () => {
    setDisplay("0");
    setAcc(null);
    setOp(null);
    setFresh(true);
    setExprLeft("");
    setShownEq(false);
  };

  const inputDigit = (d: string) => {
    if (shownEq) {
      setAcc(null);
      setOp(null);
      setExprLeft("");
      setShownEq(false);
      setDisplay(d === "." ? "0." : d);
      setFresh(false);
      return;
    }
    setDisplay((cur) => {
      if (fresh || cur === "Error") return d === "." ? "0." : d;
      if (d === "." && cur.includes(".")) return cur;
      if (cur === "0" && d !== ".") return d;
      return cur + d;
    });
    setFresh(false);
  };

  const applyOp = (next: Op) => {
    const n = Number(display);
    if (shownEq) {
      const left = display === "Error" ? "" : display;
      setAcc(Number.isFinite(n) ? n : null);
      setOp(next);
      setExprLeft(left ? `${left} ${next}` : "");
      setShownEq(false);
      setFresh(true);
      return;
    }
    if (acc != null && op && !fresh) {
      const r = compute(acc, n, op);
      const shown = formatNum(r);
      setDisplay(shown);
      setAcc(Number.isFinite(r) ? r : null);
      setOp(next);
      setExprLeft(Number.isFinite(r) ? `${shown} ${next}` : "");
    } else {
      setAcc(Number.isFinite(n) ? n : null);
      setOp(next);
      setExprLeft(display === "Error" ? "" : `${display} ${next}`);
    }
    setFresh(true);
  };

  const equals = () => {
    const n = Number(display);
    if (acc == null || !op || shownEq) return;
    const r = compute(acc, n, op);
    const shown = formatNum(r);
    setExprLeft(`${formatNum(acc)} ${op} ${display}`);
    setDisplay(shown);
    setAcc(Number.isFinite(r) ? r : null);
    setShownEq(true);
    setFresh(true);
  };

  const negate = () => {
    if (display === "Error" || shownEq) return;
    setDisplay(display.startsWith("-") ? display.slice(1) : display === "0" ? display : `-${display}`);
  };

  const backspace = () => {
    if (shownEq) {
      setShownEq(false);
      setOp(null);
      setAcc(null);
      setExprLeft("");
      return;
    }
    if (!fresh && display !== "Error" && display.length > 1) {
      const next = display.slice(0, -1);
      setDisplay(next === "-" || next === "" ? "0" : next);
      return;
    }
    if (!fresh && display.length <= 1) {
      setDisplay("0");
      setFresh(true);
      return;
    }
    if (op) {
      setOp(null);
      setExprLeft("");
      if (acc != null) setDisplay(formatNum(acc));
      setFresh(true);
    }
  };

  const pasteResult = () => {
    if (display === "Error") return;
    onInsert(display);
    onClose();
  };

  const pasteExpression = () => {
    if (display === "Error") return;
    if (shownEq && exprLeft) onInsert(`${exprLeft} = ${display}`);
    else if (op && exprLeft) onInsert(`${exprLeft} ${display}`);
    else onInsert(display);
    onClose();
  };

  const key = useCallback(
    (label: string, kind: "digit" | "op" | "fn" | "eq", className?: string) => (
      <button
        key={label}
        type="button"
        onClick={() => {
          if (kind === "digit") inputDigit(label);
          else if (kind === "op") applyOp(label as Op);
          else if (label === "AC") reset();
          else if (label === "⌫") backspace();
          else if (label === "±") negate();
          else if (label === "=") equals();
        }}
        className={cn(
          "h-14 rounded-2xl text-lg font-semibold active:opacity-80",
          kind === "eq" || kind === "op"
            ? "bg-accent text-accent-foreground"
            : kind === "fn"
              ? "bg-secondary text-foreground"
              : "bg-card text-foreground shadow-soft",
          className,
        )}
      >
        {label}
      </button>
    ),
    [display, acc, op, fresh, shownEq, exprLeft],
  );

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center">
      <button type="button" className="absolute inset-0 bg-black/30" onClick={onClose} aria-label={t("cancel")} />
      <div
        className="relative z-10 w-full max-w-md max-h-[90dvh] min-h-0 rounded-t-3xl bg-background border shadow-float flex flex-col overflow-hidden"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-between px-4 pt-3 pb-2 shrink-0">
          <p className="text-sm font-semibold">{t("memoCalculator")}</p>
          <button type="button" onClick={onClose} className="p-2 rounded-xl text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div
          className="event-sheet-scroll min-h-0 overflow-y-scroll overscroll-contain px-4 pb-2"
          style={{ flex: "1 1 0%" }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="bg-card rounded-2xl px-4 py-3 mb-3 text-right shadow-soft min-h-[88px] flex flex-col justify-end">
            <p className="text-xs text-muted-foreground min-h-[16px] break-all leading-snug">
              {expression || "\u00a0"}
            </p>
            <p className="text-3xl font-semibold tracking-tight break-all mt-1">{display}</p>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {key("AC", "fn")}
            {key("⌫", "fn")}
            {key("±", "fn")}
            {key("÷", "op")}
            {key("7", "digit")}
            {key("8", "digit")}
            {key("9", "digit")}
            {key("×", "op")}
            {key("4", "digit")}
            {key("5", "digit")}
            {key("6", "digit")}
            {key("-", "op")}
            {key("1", "digit")}
            {key("2", "digit")}
            {key("3", "digit")}
            {key("+", "op")}
            {key("0", "digit", "col-span-2")}
            {key(".", "digit")}
            {key("=", "eq")}
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2">
            <button
              type="button"
              onClick={pasteResult}
              className="w-full rounded-xl bg-secondary py-3 text-sm font-medium"
            >
              {t("memoInsertResultOnly")}
            </button>
            <button
              type="button"
              onClick={pasteExpression}
              className="w-full rounded-xl bg-secondary py-3 text-sm font-medium"
            >
              {t("memoInsertExpression")}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
