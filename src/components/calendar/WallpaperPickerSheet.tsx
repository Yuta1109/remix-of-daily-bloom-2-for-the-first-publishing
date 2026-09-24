import { useEffect } from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import { Check } from "lucide-react";
import { useI18n, type TranslationKeys } from "@/lib/i18n";
import { setOverlayChrome } from "@/lib/overlay-chrome";
import { cn } from "@/lib/utils";
import {
  WALLPAPER_CATEGORY_ORDER,
  WALLPAPER_DEFINITIONS,
  type WallpaperCategory,
} from "@/lib/v3/stamp-catalog";
import { DayWallpaperLayer } from "@/components/calendar/DayWallpaperLayer";

const CATEGORY_LABEL: Record<WallpaperCategory, TranslationKeys> = {
  birthday: "wallpaperCategoryBirthday",
  anniversary: "wallpaperCategoryAnniversary",
  travel: "wallpaperCategoryTravel",
  celebration: "wallpaperCategoryCelebration",
  seasonal: "wallpaperCategorySeasonal",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedId?: string;
  onSelect: (wallpaperId: string | undefined) => void;
}

export function WallpaperPickerSheet({ open, onOpenChange, selectedId, onSelect }: Props) {
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return;
    setOverlayChrome(true);
    return () => setOverlayChrome(false);
  }, [open]);

  return (
    <DrawerPrimitive.Root open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Overlay className="fixed inset-0 z-50 bg-black/20 backdrop-blur-[1px]" />
        <DrawerPrimitive.Content
          className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl border bg-background max-h-[78vh] min-h-0 overflow-hidden outline-none"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-muted shrink-0 touch-none" />
          <div className="px-5 pt-3 pb-3 border-b border-border/50 shrink-0">
            <DrawerPrimitive.Title className="text-base font-semibold">
              {t("calendarWallpaper")}
            </DrawerPrimitive.Title>
          </div>
          <div
            className="event-sheet-scroll min-h-0 overflow-y-scroll overscroll-contain px-4 py-3 space-y-5"
            style={{ flex: "1 1 0%" }}
            data-vaul-no-drag=""
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => onSelect(undefined)}
              className={cn(
                "w-full flex items-center justify-between rounded-xl px-4 py-3 text-left border",
                !selectedId
                  ? "border-accent bg-accent/10"
                  : "border-border/60 bg-secondary/30",
              )}
            >
              <span className="text-sm font-medium">{t("wallpaperNone")}</span>
              {!selectedId ? <Check className="w-4 h-4 text-accent" aria-hidden="true" /> : null}
            </button>

            {WALLPAPER_CATEGORY_ORDER.map((category) => {
              const items = WALLPAPER_DEFINITIONS.filter((w) => w.category === category);
              return (
                <section key={category}>
                  <h3 className="px-1 mb-2 text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
                    {t(CATEGORY_LABEL[category])}
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {items.map((item) => {
                      const selected = item.id === selectedId;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => onSelect(item.id)}
                          className={cn(
                            "relative overflow-hidden rounded-xl border text-left h-20",
                            selected ? "border-accent ring-1 ring-accent" : "border-border/60",
                          )}
                          aria-pressed={selected}
                          aria-label={t(item.labelKey as TranslationKeys)}
                        >
                          <DayWallpaperLayer wallpaperId={item.id} intensity="sheet" />
                          <span className="relative z-10 block px-3 py-2 text-sm font-medium">
                            {t(item.labelKey as TranslationKeys)}
                          </span>
                          {selected ? (
                            <Check
                              className="absolute top-2 right-2 w-4 h-4 text-accent z-10"
                              aria-hidden="true"
                            />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
            <div className="h-4" />
          </div>
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );
}
