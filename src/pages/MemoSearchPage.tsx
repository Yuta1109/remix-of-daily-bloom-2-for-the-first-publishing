import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Search, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  htmlToPlainText,
  isWelcomeMemo,
  loadMemoLibrary,
  MEMO_CATEGORY_COLORS,
  type MemoCategory,
  type MemoPage,
} from "@/lib/notes-store";

function formatLastEdited(ts: number, locale: string) {
  return new Date(ts).toLocaleDateString(locale === "ja" ? "ja-JP" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function matchesQuery(page: MemoPage, query: string): boolean {
  const lower = query.toLowerCase();
  const title = page.title.toLowerCase();
  const body = htmlToPlainText(page.html).toLowerCase();
  return title.includes(lower) || body.includes(lower);
}

export default function MemoSearchPage() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");

  useEffect(() => {
    setQuery(searchParams.get("q") ?? "");
  }, [searchParams]);

  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, []);

  const lib = useMemo(() => loadMemoLibrary(), [query]);

  const grouped = useMemo(() => {
    const q = query.trim();
    if (!q) return [] as Array<{ category: MemoCategory; pages: MemoPage[] }>;
    return lib.categories
      .map((category) => {
        const pages = category.pageIds
          .map((id) => lib.pages.find((p) => p.id === id))
          .filter((p): p is MemoPage => !!p)
          .filter((p) => matchesQuery(p, q));
        return { category, pages };
      })
      .filter(({ pages }) => pages.length > 0);
  }, [lib, query]);

  const updateQuery = (next: string) => {
    setQuery(next);
    if (next.trim()) {
      setSearchParams({ q: next }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  };

  const exitSearch = () => navigate("/notes");

  return (
    <div className="page-shell">
      <div className="shrink-0 px-4 pt-3 pb-2 space-y-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exitSearch}
            className="p-2 rounded-full text-foreground/80 shrink-0"
            aria-label={t("memoBackToList")}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold flex-1 truncate">{t("memoSearchTitle")}</h1>
        </div>
        <div className="relative flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60 pointer-events-none" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => updateQuery(e.target.value)}
              placeholder={t("memoSearchPlaceholder")}
              className="w-full rounded-2xl pl-10 pr-4 py-3 text-sm outline-none border border-border/30 bg-background/35 backdrop-blur-md placeholder:text-muted-foreground/50"
            />
          </div>
          <button
            type="button"
            onClick={exitSearch}
            className="shrink-0 h-11 w-11 rounded-full flex items-center justify-center text-muted-foreground bg-background/35 backdrop-blur-md border border-border/30"
            aria-label={t("memoSearchClear")}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 scrollbar-none">
        {query.trim() && grouped.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">{t("memoSearchEmpty")}</p>
        ) : null}

        <div className="space-y-5">
          {grouped.map(({ category, pages }) => {
            const cardColor = category.color || MEMO_CATEGORY_COLORS[0];
            return (
              <section key={category.id}>
                <div
                  className="rounded-2xl px-3 py-2 mb-2 text-sm font-bold truncate"
                  style={{ backgroundColor: cardColor }}
                >
                  {category.name.trim() || t("memoUntitledCategory")}
                </div>
                <div className="space-y-2">
                  {pages.map((page) => {
                    const preview = htmlToPlainText(page.html);
                    const welcome = isWelcomeMemo(page.id);
                    return (
                      <button
                        key={page.id}
                        type="button"
                        onClick={() => navigate(`/notes/${page.id}`)}
                        className={cn(
                          "w-full text-left flex flex-col gap-0.5 rounded-2xl bg-background/80 border border-border/30 px-3 py-2.5",
                        )}
                      >
                        <p className="text-[15px] font-semibold leading-snug truncate">
                          {page.title.trim() || t("memoUntitled")}
                        </p>
                        {!welcome && preview ? (
                          <p className="text-xs text-muted-foreground truncate">{preview}</p>
                        ) : null}
                        <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                          {t("memoLastEdited")}: {formatLastEdited(page.updatedAt, locale)}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
