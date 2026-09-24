import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "@/lib/firebase/AuthProvider";
import { I18nProvider } from "@/lib/i18n";
import User from "@/pages/User";
import { emptyData } from "@/lib/v3/schema";
import { resetEssencesDataCache, saveEssencesData } from "@/lib/v3/storage";
import { resetSyncModuleForTests } from "@/lib/firebase/sync";

function renderUser() {
  return render(
    <I18nProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={["/user"]}>
          <User />
        </MemoryRouter>
      </AuthProvider>
    </I18nProvider>,
  );
}

describe("Phase 10 User page", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("growth-app-lang", "en");
    resetEssencesDataCache();
    resetSyncModuleForTests();
    saveEssencesData(emptyData());
  });

  it("shows signed-out Google Sign-In, local-only sync, and keeps Points", () => {
    renderUser();
    expect(screen.getByTestId("user-auth-status").textContent).toMatch(/Signed out/i);
    expect(screen.getByRole("button", { name: "Sign in with Google" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
    expect(screen.getByTestId("user-sync-status").textContent).toMatch(/Local only/i);
    expect(screen.getByText("Points")).toBeTruthy();
    expect(
      screen.getByText(/Signing in with Google saves your data to the cloud/i),
    ).toBeTruthy();
  });
});
