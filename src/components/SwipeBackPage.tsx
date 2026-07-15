import { useRef, useState, type ReactNode, type TouchEvent } from "react";
import { cn } from "@/lib/utils";

interface Props {
  children: ReactNode;
  onBack: () => void;
  className?: string;
}

export function SwipeBackPage({ children, onBack, className }: Props) {
  const [dx, setDx] = useState(0);
  const startX = useRef(0);
  const startY = useRef(0);
  const tracking = useRef(false);

  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    if (!t || t.clientX > 24) return;
    startX.current = t.clientX;
    startY.current = t.clientY;
    tracking.current = true;
  };

  const onTouchMove = (e: TouchEvent) => {
    if (!tracking.current) return;
    const t = e.touches[0];
    if (!t) return;
    const deltaX = t.clientX - startX.current;
    const deltaY = Math.abs(t.clientY - startY.current);
    if (deltaY > 40 && deltaX < 20) {
      tracking.current = false;
      setDx(0);
      return;
    }
    if (deltaX > 0) setDx(Math.min(deltaX, window.innerWidth * 0.85));
  };

  const onTouchEnd = () => {
    if (!tracking.current) return;
    tracking.current = false;
    if (dx > 80) onBack();
    setDx(0);
  };

  return (
    <div
      className={cn("page-scroll relative", className)}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      style={{
        transform: dx > 0 ? `translateX(${dx}px)` : undefined,
        transition: tracking.current ? "none" : "transform 0.22s ease-out",
      }}
    >
      {dx > 0 && (
        <div
          className="fixed inset-y-0 left-0 w-1 bg-border/60 pointer-events-none z-50"
          style={{ opacity: Math.min(dx / 120, 1) }}
        />
      )}
      {children}
    </div>
  );
}
