import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useEdgeSwipeBack } from "@/hooks/use-edge-swipe-back";
import { goPageBack } from "@/lib/page-back";
import { rememberSessionLocation, sessionAreaForPath } from "@/lib/session-nav";
import { SessionScrollKeeper } from "@/components/SessionScrollKeeper";
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
import ProgressAnalytics from "./pages/ProgressAnalytics";
import ProgressPoints from "./pages/ProgressPoints";
import Plan from "./pages/Plan";
import PlanHome from "./pages/PlanHome";
import Replan from "./pages/Replan";
import PostponeBox from "./pages/PostponeBox";
import ReflectionCenter from "./pages/ReflectionCenter";
import ReflectionCatchUpReview from "./pages/ReflectionCatchUpReview";
import ReflectionReview from "./pages/ReflectionReview";
import Index from "./pages/Index";
import RoutineList from "./pages/RoutineList";
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

const TAB_ROOTS = new Set(["/", "/progress", "/plan", "/todo", "/calendar", "/note"]);

function AppRoutes() {
  const location = useLocation();
  const navigate = useNavigate();
  const dedicatedSwipe =
    location.pathname === "/privacy" ||
    location.pathname === "/settings" ||
    location.pathname === "/user" ||
    location.pathname === "/progress/analytics" ||
    location.pathname === "/progress/points" ||
    location.pathname === "/todo/routines" ||
    /^\/notes?\/(n|q|c)\//.test(location.pathname);
  useEdgeSwipeBack(
    () => goPageBack(navigate, "/progress"),
    !TAB_ROOTS.has(location.pathname) && !dedicatedSwipe,
  );

  useEffect(() => {
    const area = sessionAreaForPath(location.pathname);
    if (!area) return;
    rememberSessionLocation(area, `${location.pathname}${location.search}${location.hash}`);
  }, [location.pathname, location.search, location.hash]);

  return (
    <>
      <SessionScrollKeeper />
      <Routes>
        {/* Progress is the new home tab. Today (ToDo) moves to /todo but its
            existing implementation is otherwise untouched — see Index.tsx. */}
        <Route path="/" element={<Progress />} />
        <Route path="/progress" element={<Progress />} />
        <Route path="/progress/analytics" element={<ProgressAnalytics />} />
        <Route path="/progress/points" element={<ProgressPoints />} />
        <Route path="/plan" element={<Plan />} />
        <Route path="/plan/home" element={<PlanHome />} />
        <Route path="/plan/replan" element={<Replan />} />
        <Route path="/plan/postpone-box" element={<PostponeBox />} />
        <Route path="/plan/reflection" element={<ReflectionCenter />} />
        <Route path="/plan/reflection/catch-up/:type" element={<ReflectionCatchUpReview />} />
        <Route path="/plan/reflection/:sessionId" element={<ReflectionReview />} />
        <Route path="/todo" element={<Index />} />
        <Route path="/todo/routines" element={<RoutineList />} />
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
      <BottomNav />
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
