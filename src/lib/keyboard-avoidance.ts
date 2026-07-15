/** Scroll the nearest scrollable ancestor so `el` sits above the keyboard. */
export function scrollInputAboveKeyboard(el: HTMLElement): void {
  const run = () => {
    const vv = window.visualViewport;
    if (!vv) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }

    const rect = el.getBoundingClientRect();
    const visibleBottom = vv.offsetTop + vv.height;
    const targetBottom = visibleBottom - 20;

    if (rect.bottom <= targetBottom) return;

    const delta = rect.bottom - targetBottom;
    let node: HTMLElement | null = el.parentElement;
    while (node) {
      const style = getComputedStyle(node);
      const scrollable =
        /auto|scroll/.test(style.overflowY) && node.scrollHeight > node.clientHeight;
      if (scrollable) {
        node.scrollTop += delta;
        return;
      }
      node = node.parentElement;
    }
  };

  requestAnimationFrame(() => requestAnimationFrame(run));
}
