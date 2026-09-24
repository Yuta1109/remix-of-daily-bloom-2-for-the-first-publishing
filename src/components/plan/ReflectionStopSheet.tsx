import { useEffect, useState } from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import { useI18n } from "@/lib/i18n";
import { setOverlayChrome } from "@/lib/overlay-chrome";
import { createCollection, getCollections } from "@/lib/v3/repository";

export type StopResult =
  | { kind: "stop" }
  | { kind: "collection"; collectionId: string };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  forPlan: boolean;
  onConfirm: (result: StopResult) => void;
}

export function ReflectionStopSheet({ open, onOpenChange, forPlan, onConfirm }: Props) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const collections = open ? getCollections() : [];

  useEffect(() => {
    if (!open) return;
    setOverlayChrome(true);
    return () => setOverlayChrome(false);
  }, [open]);

  const saveNew = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const created = createCollection({ name: trimmed });
    onConfirm({ kind: "collection", collectionId: created.id });
  };

  return (
    <DrawerPrimitive.Root open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Overlay className="fixed inset-0 z-50 bg-black/20 backdrop-blur-[1px]" />
        <DrawerPrimitive.Content className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl border bg-background max-h-[78vh] outline-none">
          <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-muted shrink-0" />
          <div className="px-5 pt-3 pb-2">
            <DrawerPrimitive.Title className="text-base font-semibold">
              {forPlan ? t("reflectionStopPlanTitle") : t("reflectionStopTaskTitle")}
            </DrawerPrimitive.Title>
          </div>
          <div className="px-4 pb-6 space-y-2">
            <button
              type="button"
              onClick={() => onConfirm({ kind: "stop" })}
              className="w-full min-h-11 rounded-xl bg-secondary/50 px-4 py-3 text-sm font-semibold"
            >
              {t("reflectionStopOnly")}
            </button>
            {forPlan ? (
              <>
                <p className="px-1 pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("reflectionSaveToCollection")}
                </p>
                {collections.length === 0 ? (
                  <p className="px-1 text-sm text-muted-foreground">{t("reflectionEmptyCollection")}</p>
                ) : (
                  collections.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onConfirm({ kind: "collection", collectionId: c.id })}
                      className="w-full min-h-11 rounded-xl bg-secondary/50 px-4 py-3 text-left text-sm font-medium"
                    >
                      {c.name}
                    </button>
                  ))
                )}
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("reflectionCollectionName")}
                  className="w-full rounded-xl bg-secondary/50 px-3 py-3 text-sm"
                />
                <button
                  type="button"
                  onClick={saveNew}
                  className="w-full min-h-11 rounded-xl bg-accent text-accent-foreground text-sm font-semibold"
                >
                  {t("reflectionNewCollection")}
                </button>
              </>
            ) : null}
          </div>
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );
}
