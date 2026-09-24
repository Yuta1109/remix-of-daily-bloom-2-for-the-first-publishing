import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Search, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import {
  NOTES_HOME_PATH,
  noteDetailPath,
  quickMemoPath,
  searchNotesCatalog,
} from "@/lib/v3/notes-view";

export default function NotesSearchPage() {
  const { t } = useI18n();
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

  const hits = useMemo(() => searchNotesCatalog(query), [query]);

  const updateQuery = (next: string) => {
    setQuery(next);
    if (next.trim()) setSearchParams({ q: next }, { replace: true });
    else setSearchParams({}, { replace: true });
  };

  return (
    <div className="app-shell-page" data-testid="notes-search-page">
      <div className="app-shell-header px-4 pb-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(NOTES_HOME_PATH)}
            aria-label={t("notesBack")}
            className="inline-flex items-center justify-center w-9 h-9 rounded-full"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 flex items-center gap-2 rounded-xl bg-secondary/70 px-3 min-h-11">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => updateQuery(e.target.value)}
              placeholder={t("notesSearchPlaceholder")}
              data-testid="notes-search-input"
              className="flex-1 bg-transparent outline-none text-[17px] py-2"
            />
            {query ? (
              <button type="button" aria-label={t("memoSearchClear")} onClick={() => updateQuery("")}>
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <div className="app-shell-scroll px-4">
        {query.trim() && hits.length === 0 ? (
          <p className="px-1 py-6 text-sm text-muted-foreground">{t("notesSearchEmpty")}</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {hits.map((hit) => (
              <li key={`${hit.kind}-${hit.id}`}>
                <button
                  type="button"
                  data-testid={`search-hit-${hit.kind}-${hit.id}`}
                  onClick={() =>
                    navigate(hit.kind === "note" ? noteDetailPath(hit.id) : quickMemoPath(hit.id))
                  }
                  className="w-full text-left px-1 py-3 min-h-11"
                >
                  <p className="text-[13px] text-muted-foreground">
                    {hit.kind === "note" ? t("notesSectionNote") : t("notesSectionQuickMemo")}
                  </p>
                  <p className="text-[17px] leading-snug">{hit.title.trim() || t("notesUntitled")}</p>
                  {hit.preview ? (
                    <p className="text-[13px] text-muted-foreground mt-0.5 line-clamp-2">{hit.preview}</p>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
