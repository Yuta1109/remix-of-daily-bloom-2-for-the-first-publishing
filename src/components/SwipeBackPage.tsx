import { useRef, useState, type ReactNode, type TouchEvent } from "react";
import { cn } from "@/lib/utils";

interface Props {
  children: ReactNode;
  underlay?: ReactNode;
  onBack: () => void;
  className?: string;
}

export function SwipeBackPage({ children, underlay, onBack, className }: Props) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const tracking = useRef(false);

  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    if (!t || t.clientX > 28) return;
    startX.current = t.clientX;
    startY.current = t.clientY;
    tracking.current = true;
    setDragging(true);
  };

  const onTouchMove = (e: TouchEvent) => {
    if (!tracking.current) return;
    const t = e.touches[0];
    if (!t) return;
    const deltaX = t.clientX - startX.current;
    const deltaY = Math.abs(t.clientY - startY.current);
    if (deltaY > 48 && deltaX < 24) {
      tracking.current = false;
      setDragging(false);
      setDx(0);
      return;
    }
    if (deltaX > 0) {
      e.preventDefault();
      setDx(Math.min(deltaX, window.innerWidth));
    }
  };

  const finish = () => {
    if (!tracking.current) return;
    tracking.current = false;
    setDragging(false);
    if (dx > window.innerWidth * 0.33) onBack();
    setDx(0);
  };

  return (
    <div className="fixed inset-0 z-[70] overflow-hidden">
      {underlay && (
        <div className="absolute inset-0 overflow-hidden bg-background">
          {underlay}
        </div>
      )}

      <div
        className={cn(
          "absolute inset-0 bg-background shadow-lg page-scroll",
          className
        )}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={finish}
        onTouchCancel={finish}
        style={{
          transform: dx > 0 ? `translateX(${dx}px)` : undefined,
          transition: dragging ? "none" : "transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
