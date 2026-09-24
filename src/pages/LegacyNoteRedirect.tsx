import { Navigate, useParams } from "react-router-dom";
import { NOTES_HOME_PATH, pathForNotesTarget, resolveNotesParam } from "@/lib/v3/notes-view";

/** Maps `/notes/:memoId` (and `/note/:memoId`) onto the V3 Notes routes. */
export default function LegacyNoteRedirect() {
  const { memoId = "" } = useParams();
  const target = resolveNotesParam(memoId);
  return <Navigate to={pathForNotesTarget(target) || NOTES_HOME_PATH} replace />;
}
