/** Reset iOS Safari / WKWebView zoom after keyboard dismiss. */
export function resetViewportZoom(): void {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }

  const meta = document.querySelector('meta[name="viewport"]');
  if (meta) {
    const base = "width=device-width, initial-scale=1.0, viewport-fit=cover";
    meta.setAttribute("content", `${base}, maximum-scale=1.0`);
    requestAnimationFrame(() => {
      meta.setAttribute("content", base);
    });
  }

  window.scrollTo(0, 0);
}
