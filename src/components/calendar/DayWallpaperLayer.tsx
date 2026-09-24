import { cn } from "@/lib/utils";
import { wallpaperDefinition } from "@/lib/v3/stamp-catalog";

interface Props {
  wallpaperId?: string;
  /** Cell: very faint. Sheet: a bit more present, still secondary. */
  intensity?: "cell" | "sheet";
  className?: string;
}

/** Background wash only. Never intercepts taps. */
export function DayWallpaperLayer({ wallpaperId, intensity = "cell", className }: Props) {
  const def = wallpaperId ? wallpaperDefinition(wallpaperId) : undefined;
  if (!def) return null;
  return (
    <div
      aria-hidden="true"
      className={cn("absolute inset-0 pointer-events-none overflow-hidden", className)}
      style={{
        background: def.background,
        opacity: intensity === "cell" ? 0.38 : 0.28,
      }}
    />
  );
}
