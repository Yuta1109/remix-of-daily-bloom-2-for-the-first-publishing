import "@testing-library/jest-dom";
import { beforeEach } from "vitest";
import { resetCalendarAdapterForTests } from "@/lib/events-store";

// jsdom has no ResizeObserver. Several components (BottomNav, InsetScrollArea)
// use it to measure their own rendered size; a no-op stub is enough for tests.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(window, "ResizeObserver", {
  writable: true,
  value: ResizeObserverStub,
});

beforeEach(() => {
  resetCalendarAdapterForTests();
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
