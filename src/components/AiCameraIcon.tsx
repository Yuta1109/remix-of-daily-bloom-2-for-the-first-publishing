import { Camera } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  iconClassName?: string;
  /** today: larger camera, optically centered in the task bar. memo: tighter AI badge on a larger camera. */
  variant?: "today" | "memo";
};

/** Camera icon with a small AI badge above the lens (OCR / image recognition). */
export function AiCameraIcon({ className, iconClassName, variant = "today" }: Props) {
  if (variant === "memo") {
    return (
      <span
        className={cn(
          "relative inline-flex flex-col items-center justify-center leading-none translate-y-[3px]",
          className,
        )}
      >
        <span
          className="absolute left-1/2 -translate-x-1/2 -top-2 text-[7px] font-bold tracking-tight text-accent-foreground bg-accent rounded px-[3px] py-px shadow-sm"
          aria-hidden
        >
          AI
        </span>
        <Camera className={cn("w-6 h-6", iconClassName)} />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "relative inline-flex flex-col items-center justify-center leading-none",
        className,
      )}
    >
      <span
        className="text-[7px] font-bold tracking-tight text-accent-foreground bg-accent rounded px-[3px] py-px shadow-sm"
        aria-hidden
      >
        AI
      </span>
      <Camera className={cn("w-[22px] h-[22px] -mt-px", iconClassName)} />
    </span>
  );
}
