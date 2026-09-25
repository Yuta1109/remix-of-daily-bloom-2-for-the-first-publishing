import { Route, Routes } from "react-router-dom";
import NotesHomePage from "./NotesHomePage";
import NotesSearchPage from "./NotesSearchPage";
import MemoDetailPage from "./MemoDetailPage";
import QuickMemoPage from "./QuickMemoPage";
import CollectionPage from "./CollectionPage";
import LegacyNoteRedirect from "./LegacyNoteRedirect";
import { NotesCatalogPage } from "./NotesCatalogPage";

export default function Notes() {
  return (
    <Routes>
      <Route index element={<NotesHomePage />} />
      <Route path="search" element={<NotesSearchPage />} />
      <Route path="search/quick" element={<NotesCatalogPage kind="quick" mode="search" />} />
      <Route path="search/notes" element={<NotesCatalogPage kind="note" mode="search" />} />
      <Route path="search/collections" element={<NotesCatalogPage kind="collection" mode="search" />} />
      <Route path="list/quick" element={<NotesCatalogPage kind="quick" mode="list" />} />
      <Route path="list/notes" element={<NotesCatalogPage kind="note" mode="list" />} />
      <Route path="list/collections" element={<NotesCatalogPage kind="collection" mode="list" />} />
      <Route path="n/:noteId" element={<MemoDetailPage />} />
      <Route path="q/:quickMemoId" element={<QuickMemoPage />} />
      <Route path="c/:collectionId" element={<CollectionPage />} />
      <Route path=":memoId" element={<LegacyNoteRedirect />} />
    </Routes>
  );
}
