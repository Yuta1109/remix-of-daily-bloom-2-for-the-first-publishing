import { Camera } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  iconClassName?: string;
};

/** Camera icon with a small AI badge above the lens (OCR / image recognition). */
export function AiCameraIcon({ className, iconClassName }: Props) {
  return (
    <span className={cn("relative inline-flex items-center justify-center", className)}>
      <Camera className={cn("w-4 h-4", iconClassName)} />
      <span
        className="absolute -top-2 left-1/2 -translate-x-1/2 text-[7px] font-bold leading-none tracking-tight text-accent-foreground bg-accent rounded px-[3px] py-px shadow-sm"
        aria-hidden
      >
        AI
      </span>
    </span>
  );
}
