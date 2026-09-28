import { CircleUserRound } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { GlassControl } from "@/components/GlassControl";

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
  const location = useLocation();
  const { t } = useI18n();

  return (
    <GlassControl
      variant="regular"
      onClick={() => navigate("/user", { state: { from: location.pathname } })}
      aria-label={t("userButtonLabel")}
      className={cn("text-foreground/80", className)}
    >
      <CircleUserRound className="w-6 h-6" strokeWidth={1.75} aria-hidden="true" />
    </GlassControl>
  );
}
