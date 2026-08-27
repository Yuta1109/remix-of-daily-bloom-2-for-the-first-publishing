import { Route, Routes } from "react-router-dom";
import MemoListPage from "./MemoListPage";
import MemoDetailPage from "./MemoDetailPage";
import MemoSearchPage from "./MemoSearchPage";

export default function Notes() {
  return (
    <Routes>
      <Route index element={<MemoListPage />} />
      <Route path="search" element={<MemoSearchPage />} />
      <Route path=":memoId" element={<MemoDetailPage />} />
    </Routes>
  );
}
