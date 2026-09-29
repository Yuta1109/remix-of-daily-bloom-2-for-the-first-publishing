import { useLayoutEffect, useRef } from "react";
import {
  registerNativeGlass,
  unregisterNativeGlass,
  type NativeGlassRegistration,
} from "@/lib/native-glass";

/**
 * Opts one DOM control into the shared native Liquid Glass overlay.
 * The element keeps its React handler. Native glass, when iOS 26 applies it,
 * is drawn on this element's frame and the CSS material is hidden.
 */
export function useNativeGlass<T extends HTMLElement>(
  ref: { readonly current: T | null },
  spec: NativeGlassRegistration | null,
): void {
  const tabsKey = JSON.stringify(spec?.tabs ?? []);
  const specRef = useRef(spec);
  specRef.current = spec;

  useLayoutEffect(() => {
    const current = specRef.current;
    const el = ref.current;
    if (!current || !el) return;
    el.setAttribute("data-native-glass-host", "");
    if (current.role === "surface") el.setAttribute("data-native-glass-surface", "");
    if (current.role !== "tabBar") el.setAttribute("data-native-glass-id", current.id);
    registerNativeGlass({ ...current, element: el, tabs: JSON.parse(tabsKey) as NativeGlassRegistration["tabs"] });
    return () => {
      el.removeAttribute("data-native-glass-host");
      el.removeAttribute("data-native-glass-surface");
      if (current.role !== "tabBar") el.removeAttribute("data-native-glass-id");
      unregisterNativeGlass(current.id);
    };
  }, [
    ref,
    spec?.id,
    spec?.role,
    spec?.label,
    spec?.symbol,
    spec?.prominent,
    spec?.enabled,
    spec?.value,
    spec?.passThrough,
    tabsKey,
  ]);
}
