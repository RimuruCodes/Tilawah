import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation, Outlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ThemeProvider } from 'next-themes';
import { lazy, Suspense } from 'react';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { SubscriptionProvider } from '@/lib/SubscriptionContext';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import BottomTabBar from '@/components/BottomTabBar';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import Home from '@/pages/Home';
import Landing from '@/pages/Landing';
import QuranIndex from '@/pages/QuranIndex';
import SurahReader from '@/pages/SurahReader';

// Lazy-loaded pages: Progress pulls in recharts (meaningfully large, only
// needed once someone opens their progress page); the rest are secondary
// screens that don't need to weigh down the initial bundle that serves the
// core reading/recitation flow.
const Progress = lazy(() => import('@/pages/Progress'));
const Settings = lazy(() => import('@/pages/Settings'));
const Hadith = lazy(() => import('@/pages/Hadith'));
const Donate = lazy(() => import('@/pages/Donate'));
const About = lazy(() => import('@/pages/About'));
const Contact = lazy(() => import('@/pages/Contact'));
const Privacy = lazy(() => import('@/pages/Privacy'));
const Terms = lazy(() => import('@/pages/Terms'));

// Signed-in layout: pages render above a persistent bottom tab bar. The
// surah reader opts out (immersive reading/recitation view with its own
// back navigation), so no bar and no reserved padding there.
const AppShell = () => {
  const { pathname } = useLocation();
  const immersive = pathname.startsWith('/surah/');
  return (
    <div className={immersive ? '' : 'pb-[calc(3.75rem+env(safe-area-inset-bottom))]'}>
      <Outlet />
      {!immersive && <BottomTabBar />}
    </div>
  );
};

// "/" is the one route that must render something for a signed-out visitor
// instead of bouncing straight to /login (2026-07: real user report — they
// "felt pushed" into an account before understanding what the app does).
// isLoadingAuth is already resolved by the time this renders — AuthenticatedApp
// below doesn't mount the route tree at all until then — so no separate
// loading state is needed here.
const RootRoute = () => {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Landing />;
  return (
    <div className="pb-[calc(3.75rem+env(safe-area-inset-bottom))]">
      <Home />
      <BottomTabBar />
    </div>
  );
};

const PageLoader = () => (
  <div className="min-h-screen bg-slate-950 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-700 border-t-emerald-400 rounded-full animate-spin"></div>
  </div>
);

const PageTransition = ({ children }) => (
  <motion.div
    initial={{ x: '100%', opacity: 0 }}
    animate={{ x: 0, opacity: 1 }}
    exit={{ x: '-100%', opacity: 0 }}
    transition={{ duration: 0.25, ease: 'easeInOut' }}
  >
    <Suspense fallback={<PageLoader />}>{children}</Suspense>
  </motion.div>
);

const AuthenticatedApp = () => {
  const { isLoadingAuth } = useAuth();
  const location = useLocation();

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin"></div>
          <p className="text-sm text-slate-500">Loading Quran Companion...</p>
        </div>
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/login" element={<PageTransition><Login /></PageTransition>} />
        <Route path="/register" element={<PageTransition><Register /></PageTransition>} />
        <Route path="/forgot-password" element={<PageTransition><ForgotPassword /></PageTransition>} />
        <Route path="/reset-password" element={<PageTransition><ResetPassword /></PageTransition>} />
        <Route path="/about" element={<PageTransition><About /></PageTransition>} />
        <Route path="/contact" element={<PageTransition><Contact /></PageTransition>} />
        {/* Legal pages are public on purpose: people must be able to read
            them BEFORE creating an account or paying. */}
        <Route path="/privacy" element={<PageTransition><Privacy /></PageTransition>} />
        <Route path="/terms" element={<PageTransition><Terms /></PageTransition>} />
        <Route path="/" element={<PageTransition><RootRoute /></PageTransition>} />
        <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
          <Route element={<AppShell />}>
            <Route path="/quran" element={<PageTransition><QuranIndex /></PageTransition>} />
            <Route path="/hadith" element={<PageTransition><Hadith /></PageTransition>} />
            <Route path="/surah/:number" element={<PageTransition><SurahReader /></PageTransition>} />
            <Route path="/progress" element={<PageTransition><Progress /></PageTransition>} />
            <Route path="/donate" element={<PageTransition><Donate /></PageTransition>} />
            <Route path="/settings" element={<PageTransition><Settings /></PageTransition>} />
          </Route>
        </Route>
        <Route path="*" element={<PageTransition><PageNotFound /></PageTransition>} />
      </Routes>
    </AnimatePresence>
  );
};

function App() {
  return (
    <AuthProvider>
      <SubscriptionProvider>
        <QueryClientProvider client={queryClientInstance}>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <Router>
              <ScrollToTop />
              <AuthenticatedApp />
            </Router>
          </ThemeProvider>
          <Toaster />
        </QueryClientProvider>
      </SubscriptionProvider>
    </AuthProvider>
  )
}

export default App