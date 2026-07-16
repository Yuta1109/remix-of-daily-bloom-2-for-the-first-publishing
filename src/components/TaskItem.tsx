import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { Check, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { hideKeyboard, scrollInputAboveKeyboard } from "@/lib/keyboard-avoidance";
import type { Task } from "@/lib/store";

interface TaskItemProps {
  task: Task;
  selected: boolean;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, text: string) => void;
}

const DELETE_WIDTH = 72;
const DELETE_THRESHOLD = 56;

export function TaskItem({
  task,
  selected,
  onSelect,
  onToggle,
  onDelete,
  onEdit,
}: TaskItemProps) {
  const [popping, setPopping] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.text);
  const [offsetX, setOffsetX] = useState(0);
  const [swiping, setSwiping] = useState(false);

  const rowRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const startOffsetRef = useRef(0);
  const axisRef = useRef<"x" | "y" | null>(null);
  const offsetRef = useRef(0);
  const editingRef = useRef(editing);
  editingRef.current = editing;

  const handleToggle = (e: MouseEvent) => {
    e.stopPropagation();
    if (!selected) {
      onSelect(task.id);
      return;
    }
    if (!task.completed) {
      setPopping(true);
      setShowFeedback(true);
      setTimeout(() => setShowFeedback(false), 1200);
    }
    onToggle(task.id);
    setTimeout(() => setPopping(false), 300);
  };

  const commitEdit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== task.text) onEdit(task.id, trimmed);
    else setDraft(task.text);
    setEditing(false);
    void hideKeyboard();
  };

  const closeSwipe = () => {
    offsetRef.current = 0;
    setOffsetX(0);
  };

  // Non-passive touch listeners so horizontal swipe can preventDefault (block list scroll).
  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;

    const onStart = (e: TouchEvent) => {
      if (editingRef.current) return;
      const t = e.touches[0];
      startXRef.current = t.clientX;
      startYRef.current = t.clientY;
      startOffsetRef.current = offsetRef.current;
      axisRef.current = null;
      setSwiping(true);
    };

    const onMove = (e: TouchEvent) => {
      if (editingRef.current || axisRef.current === "y") return;
      const t = e.touches[0];
      const dx = t.clientX - startXRef.current;
      const dy = t.clientY - startYRef.current;

      if (axisRef.current === null) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        axisRef.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (axisRef.current === "y") {
          setSwiping(false);
          return;
        }
      }
      if (axisRef.current !== "x") return;

      e.preventDefault();
      const next = Math.min(0, Math.max(-DELETE_WIDTH, startOffsetRef.current + dx));
      offsetRef.current = next;
      setOffsetX(next);
    };

    const onEnd = () => {
      if (axisRef.current === "x") {
        if (offsetRef.current <= -DELETE_THRESHOLD) {
          offsetRef.current = -DELETE_WIDTH;
          setOffsetX(-DELETE_WIDTH);
        } else {
          offsetRef.current = 0;
          setOffsetX(0);
        }
      }
      axisRef.current = null;
      setSwiping(false);
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Swipe-revealed delete — avoids the × sitting under the FAB. */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          closeSwipe();
          onDelete(task.id);
        }}
        className="absolute inset-y-0 right-0 w-[72px] bg-destructive text-destructive-foreground flex items-center justify-center touch-manipulation"
        aria-label="Delete"
      >
        <Trash2 className="w-5 h-5" />
      </button>

      <div
        ref={rowRef}
        role="button"
        tabIndex={0}
        onClick={() => {
          if (offsetRef.current < 0) {
            closeSwipe();
            return;
          }
          if (!selected) onSelect(task.id);
        }}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !selected) {
            e.preventDefault();
            onSelect(task.id);
          }
        }}
        className={cn(
          // Opaque fill so the delete affordance never bleeds through while closed.
          "relative rounded-xl px-3 py-2.5 touch-manipulation select-none bg-secondary",
          selected && "ring-1 ring-accent/40",
          task.completed && !selected && "opacity-80"
        )}
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: swiping ? "none" : "transform 0.2s ease-out",
        }}
      >
        <div className="flex items-center gap-1.5 min-h-[40px]">
          <button
            type="button"
            onClick={handleToggle}
            aria-label={task.completed ? "Mark incomplete" : "Mark complete"}
            className="flex-shrink-0 w-10 h-10 flex items-center justify-center touch-manipulation"
          >
            <span
              className={cn(
                "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-300 pointer-events-none",
                task.completed
                  ? "bg-accent border-accent"
                  : "border-muted-foreground/25",
                popping && "animate-check-pop"
              )}
            >
              {task.completed && (
                <Check className="w-3.5 h-3.5 text-accent-foreground" strokeWidth={3} />
              )}
            </span>
          </button>

          {editing && selected ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onFocus={(e) => scrollInputAboveKeyboard(e.currentTarget)}
              onClick={(e) => e.stopPropagation()}
              onBlur={commitEdit}
              enterKeyHint="done"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitEdit();
                }
                if (e.key === "Escape") {
                  setDraft(task.text);
                  setEditing(false);
                  void hideKeyboard();
                }
              }}
              className="flex-1 min-w-0 text-base bg-transparent outline-none py-1.5"
            />
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (offsetRef.current < 0) {
                  closeSwipe();
                  return;
                }
                if (!selected) {
                  onSelect(task.id);
                  return;
                }
                if (!task.completed) {
                  setDraft(task.text);
                  setEditing(true);
                }
              }}
              className="flex-1 min-w-0 min-h-9 py-1 text-left touch-manipulation"
            >
              <span
                className={cn(
                  "text-base transition-all duration-300 block truncate",
                  task.completed && "line-through text-muted-foreground/50"
                )}
              >
                {task.text}
              </span>
            </button>
          )}
        </div>

        {showFeedback && (
          <span className="absolute left-11 top-0 text-accent text-xs font-bold animate-float-up flex items-center gap-0.5 pointer-events-none">
            <Sparkles className="w-3 h-3" /> +1
          </span>
        )}
      </div>
    </div>
  );
}
