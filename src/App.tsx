import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BottomNav } from "@/components/BottomNav";
import { AppTutorial } from "@/components/tutorial/AppTutorial";
import { I18nProvider } from "@/lib/i18n";
import { AuthProvider } from "@/lib/firebase/AuthProvider";
import { MemoArchiveNotice } from "@/components/MemoArchiveNotice";
import { ensureLegacyCatchup } from "@/lib/v3/storage";
import { ensureLegacyMemoArchive } from "@/lib/v3/legacy-memo-archive";
import Progress from "./pages/Progress";
import Plan from "./pages/Plan";
import ReflectionCenter from "./pages/ReflectionCenter";
import ReflectionCatchUpReview from "./pages/ReflectionCatchUpReview";
import ReflectionReview from "./pages/ReflectionReview";
import Index from "./pages/Index";
import Calendar from "./pages/Calendar";
import Notes from "./pages/Notes";
import User from "./pages/User";
import Settings from "./pages/Settings";
import Privacy from "./pages/Privacy";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

ensureLegacyCatchup();
ensureLegacyMemoArchive();

/**
 * Startup order (do not reverse):
 * 1. Legacy ToDo / reusable catch-up into local V3
 * 2. Legacy memo archive into 「過去のメモ」
 * 3. Sidecar settings hydrate (inside loadEssencesData)
 * 4. AuthProvider restores Google session and reconciles cloud *after* local V3 exists
 */

/**
 * Routes that present their own full-screen chrome (back button, no tab bar).
 * Mirrors how `/privacy` already hid the tab bar before this Phase.
 */
const HIDE_NAV_ROUTES = ["/privacy", "/settings", "/user"];

function AppRoutes() {
  const location = useLocation();
  const hideNav = HIDE_NAV_ROUTES.includes(location.pathname);

  return (
    <>
      <Routes>
        {/* Progress is the new home tab. Today (ToDo) moves to /todo but its
            existing implementation is otherwise untouched — see Index.tsx. */}
        <Route path="/" element={<Progress />} />
        <Route path="/progress" element={<Progress />} />
        <Route path="/plan" element={<Plan />} />
        <Route path="/plan/reflection" element={<ReflectionCenter />} />
        <Route path="/plan/reflection/catch-up/:type" element={<ReflectionCatchUpReview />} />
        <Route path="/plan/reflection/:sessionId" element={<ReflectionReview />} />
        <Route path="/todo" element={<Index />} />
        <Route path="/calendar" element={<Calendar />} />
        {/* New canonical Note tab path, plus the legacy /notes prefix so
            existing deep links (search, memo detail) keep resolving. */}
        <Route path="/note/*" element={<Notes />} />
        <Route path="/notes/*" element={<Notes />} />
        <Route path="/user" element={<User />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      {!hideNav && <BottomNav />}
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <I18nProvider>
        <AuthProvider>
          <Sonner />
          <BrowserRouter>
            <AppRoutes />
            {/* Outside route-switching tree so tab changes cannot remount the tour. */}
            <AppTutorial />
            <MemoArchiveNotice />
          </BrowserRouter>
        </AuthProvider>
      </I18nProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
