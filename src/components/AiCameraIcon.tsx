import { Camera } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  iconClassName?: string;
};

/** Camera icon with a small AI badge above the lens (OCR / image recognition). */
export function AiCameraIcon({ className, iconClassName }: Props) {
  return (
    <span
      className={cn(
        "relative inline-flex flex-col items-center justify-center leading-none translate-y-[2px]",
        className,
      )}
    >
      <span
        className="text-[7px] font-bold tracking-tight text-accent-foreground bg-accent rounded px-[3px] py-px shadow-sm mb-px"
        aria-hidden
      >
        AI
      </span>
      <Camera className={cn("w-4 h-4", iconClassName)} />
    </span>
  );
}
