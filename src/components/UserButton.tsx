import { CircleUserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

interface Props {
  className?: string;
}

/**
 * Reusable profile/account entry point for the App Shell.
 *
 * Deliberately subtle — a plain outline icon, not a filled/colored badge — so
 * it never competes with a page's own large title. No user data is faked: with
 * no profile yet, it is always the same generic account glyph.
 */
export function UserButton({ className }: Props) {
  const navigate = useNavigate();
  const { t } = useI18n();

  return (
    <button
      type="button"
      onClick={() => navigate("/user")}
      aria-label={t("userButtonLabel")}
      className={cn(
        "inline-flex items-center justify-center w-9 h-9 rounded-full",
        "text-foreground/70 hover:text-foreground hover:bg-secondary/70",
        "transition-colors motion-reduce:transition-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
    >
      <CircleUserRound className="w-6 h-6" strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}
