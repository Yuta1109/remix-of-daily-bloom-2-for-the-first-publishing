import { Route, Routes } from "react-router-dom";
import MemoListPage from "./MemoListPage";
import MemoDetailPage from "./MemoDetailPage";

export default function Notes() {
  return (
    <Routes>
      <Route index element={<MemoListPage />} />
      <Route path=":memoId" element={<MemoDetailPage />} />
    </Routes>
  );
}
