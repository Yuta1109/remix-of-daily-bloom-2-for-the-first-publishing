import { Route, Routes } from "react-router-dom";
import NotesHomePage from "./NotesHomePage";
import NotesSearchPage from "./NotesSearchPage";
import MemoDetailPage from "./MemoDetailPage";
import QuickMemoPage from "./QuickMemoPage";
import CollectionPage from "./CollectionPage";
import LegacyNoteRedirect from "./LegacyNoteRedirect";

export default function Notes() {
  return (
    <Routes>
      <Route index element={<NotesHomePage />} />
      <Route path="search" element={<NotesSearchPage />} />
      <Route path="n/:noteId" element={<MemoDetailPage />} />
      <Route path="q/:quickMemoId" element={<QuickMemoPage />} />
      <Route path="c/:collectionId" element={<CollectionPage />} />
      <Route path=":memoId" element={<LegacyNoteRedirect />} />
    </Routes>
  );
}
