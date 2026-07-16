import { useEffect, useRef } from "react";
import { Home, Calendar, Settings } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useI18n();
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = navRef.current;
    if (!el) return;

    const publish = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      document.documentElement.style.setProperty("--bottom-nav-offset", `${h}px`);
    };

    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    window.addEventListener("orientationchange", publish);
    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", publish);
    };
  }, []);

  const tabs = [
    { path: "/", icon: Home, label: t("today") },
    { path: "/calendar", icon: Calendar, label: t("calendar") },
    { path: "/settings", icon: Settings, label: t("settings") },
  ];

  return (
    <nav
      ref={navRef}
      className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50"
    >
      <div
        className="flex justify-around items-center pt-[2px]"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {tabs.map(({ path, icon: Icon, label }) => {
          const active = location.pathname === path;
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={cn(
                "flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl transition-colors justify-center",
                active ? "text-accent" : "text-muted-foreground"
              )}
            >
              <Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 1.8} />
              <span className="text-[10px] font-medium leading-none">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
