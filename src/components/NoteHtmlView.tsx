import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

function renderLatex(src: string) {
  try {
    return katex.renderToString(src, {
      throwOnError: false,
      displayMode: true,
      output: "html",
    });
  } catch {
    return src;
  }
}

function LatexBlock({ latex }: { latex: string }) {
  const html = useMemo(() => renderLatex(latex), [latex]);
  return (
    <div className="ocr-latex-scroll my-2">
      <div className="ocr-latex-inner" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

export function NoteHtmlView({ html }: { html: string }) {
  const hasLatex = html?.includes("ocr-latex-block");

  const latexParts = useMemo(() => {
    if (!hasLatex || typeof window === "undefined") return null;
    const wrap = document.createElement("div");
    wrap.innerHTML = html || "";
    return Array.from(wrap.childNodes).map((node, i) => {
      if (node instanceof HTMLElement && node.classList.contains("ocr-latex-block")) {
        return (
          <LatexBlock key={i} latex={node.getAttribute("data-latex") || ""} />
        );
      }
      if (node instanceof HTMLElement) {
        return (
          <div
            key={i}
            className="note-html-block"
            dangerouslySetInnerHTML={{ __html: node.outerHTML }}
          />
        );
      }
      if ((node.textContent || "").trim()) {
        return <div key={i}>{node.textContent}</div>;
      }
      return null;
    });
  }, [html, hasLatex]);

  if (!html?.trim()) return null;

  if (!hasLatex) {
    return (
      <div
        className="note-html-view w-full text-base leading-relaxed text-foreground text-left"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <div className="note-html-view w-full text-base leading-relaxed text-foreground text-left">
      {latexParts}
    </div>
  );
}
