import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { I18nProvider } from "@/lib/i18n";
import QuickMemoPage from "@/pages/QuickMemoPage";
import { createQuickMemo } from "@/lib/v3/repository";
import { emptyData } from "@/lib/v3/schema";
import { resetEssencesDataCache, saveEssencesData } from "@/lib/v3/storage";

describe("Phase 11 Quick Memo conversion UI", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("growth-app-lang", "en");
    resetEssencesDataCache();
    saveEssencesData(emptyData());
  });

  it("shows Task / Plan / Event convert actions and keeps the editor", () => {
    const memo = createQuickMemo({ text: "Convert me" });
    render(
      <I18nProvider>
        <MemoryRouter initialEntries={[`/note/q/${memo.id}`]}>
          <Routes>
            <Route path="/note/q/:quickMemoId" element={<QuickMemoPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );
    expect(screen.getByTestId("quick-memo-convert-task")).toBeTruthy();
    expect(screen.getByTestId("quick-memo-convert-plan")).toBeTruthy();
    expect(screen.getByTestId("quick-memo-convert-event")).toBeTruthy();
    fireEvent.click(screen.getByTestId("quick-memo-convert-plan"));
    expect(screen.getByTestId("quick-memo-plan-level-future")).toBeTruthy();
    expect((screen.getByTestId("quick-memo-editor") as HTMLTextAreaElement).value).toBe("Convert me");
  });
});
