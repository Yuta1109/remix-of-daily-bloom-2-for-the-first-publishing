import { useId, useMemo, useRef, useState } from "react";
import { ArrowLeft, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "@/lib/i18n";
import { GlassControl } from "@/components/GlassControl";
import { useNativeGlass } from "@/hooks/use-native-glass";
import { htmlToPlainText } from "@/lib/notes-store";
import { goPageBack } from "@/lib/page-back";
import {
  NOTES_HOME_PATH,
  collectionPath,
  noteDetailPath,
  notesCollectionSearchPath,
  notesNoteSearchPath,
  notesQuickSearchPath,
  quickMemoPath,
  searchCollections,
  searchNotePages,
  searchQuickMemos,
  PAST_MEMOS_COLLECTION_ID,
} from "@/lib/v3/notes-view";

export type NotesCatalogKind = "quick" | "note" | "collection";

export function NotesCatalogPage({
  kind,
  mode,
}: {
  kind: NotesCatalogKind;
  mode: "list" | "search";
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const searchId = useId();
  const title =
    kind === "quick"
      ? t("notesSectionQuickMemo")
      : kind === "note"
        ? t("notesSectionNote")
        : t("notesSectionCollections");
  const placeholder =
    kind === "quick"
      ? t("notesSearchQuickPlaceholder")
      : kind === "note"
        ? t("notesSearchNotePlaceholder")
        : t("notesSearchCollectionPlaceholder");
  useNativeGlass(searchRef, mode === "search" ? {
    id: searchId,
    role: "search",
    label: placeholder,
    value: query,
  } : null);

  const rows = useMemo(() => {
    const q = mode === "search" ? query : "";
    if (kind === "quick") {
      return searchQuickMemos(q).map((memo) => ({
        id: memo.id,
        title: memo.text.trim() || t("notesUntitled"),
        href: quickMemoPath(memo.id),
        testId: `quick-memo-row-${memo.id}`,
      }));
    }
    if (kind === "note") {
      return searchNotePages(q).map((note) => ({
        id: note.id,
        title: note.title.trim() || t("notesUntitled"),
        preview: htmlToPlainText(note.html),
        href: noteDetailPath(note.id),
        testId: `note-row-${note.id}`,
      }));
    }
    return searchCollections(q).map((collection) => ({
      id: collection.id,
      title: collection.name,
      href: collectionPath(collection.id),
      testId:
        collection.id === PAST_MEMOS_COLLECTION_ID
          ? "past-memos-collection-row"
          : `collection-row-${collection.id}`,
    }));
  }, [kind, mode, query, t]);

  return (
    <div className="app-shell-page" data-testid={`notes-${mode}-${kind}`}>
      <div className="app-shell-header pl-2 pr-4 pb-2" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="flex items-center gap-2">
          <GlassControl nativeGlass={{ role: "back" }} aria-label={t("notesBack")} onClick={() => goPageBack(navigate, NOTES_HOME_PATH)}>
            <ArrowLeft className="w-5 h-5" />
          </GlassControl>
          <h1 className="text-lg font-semibold">{title}</h1>
          {mode === "list" && (
            <GlassControl
              nativeGlass={{ role: "icon", symbol: "magnifyingglass" }}
              aria-label={t("notesSearchTitle")}
              data-testid={`notes-search-${kind}`}
              className="ml-auto"
              onClick={() =>
                navigate(
                  kind === "quick"
                    ? notesQuickSearchPath()
                    : kind === "note"
                      ? notesNoteSearchPath()
                      : notesCollectionSearchPath(),
                )
              }
            >
              <Search className="w-5 h-5" />
            </GlassControl>
          )}
        </div>
        {mode === "search" && (
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            data-testid={`notes-search-input-${kind}`}
            className="liquid-glass liquid-glass-field mt-2 w-full min-w-0 max-w-full px-3 py-2 text-[16px] outline-none"
          />
        )}
      </div>
      <div className="app-shell-scroll px-4">
        {rows.length === 0 ? (
          <p className="px-1 py-6 text-sm text-muted-foreground">{t("notesSearchEmpty")}</p>
        ) : (
          <ul className="rounded-2xl bg-card shadow-soft divide-y divide-border/60">
            {rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  data-testid={row.testId}
                  onClick={() => navigate(row.href)}
                  className="w-full text-left px-3 py-3 min-h-11"
                >
                  <p className="text-[17px] leading-snug line-clamp-2">{row.title}</p>
                  {"preview" in row && row.preview ? (
                    <p className="text-[13px] text-muted-foreground mt-0.5 line-clamp-2">{row.preview}</p>
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
