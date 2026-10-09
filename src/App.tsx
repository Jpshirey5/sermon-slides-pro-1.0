import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import CreateSermon from "./pages/CreateSermon";
import SermonReview from "./pages/SermonReview";
import SlideEditor from "./pages/SlideEditor";
import Login from "./pages/Login";
import DesktopLogin from "./pages/DesktopLogin";
import { DesktopGate } from "@/desktop/DesktopGate";
import { getDesktop } from "@/desktop/bridge";
import SignUp from "./pages/SignUp";
import SignupComplete from "./pages/SignupComplete";
import SignupIncomplete from "./pages/SignupIncomplete";
import InviteSignUp from "./pages/InviteSignUp";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import AuthConfirm from "./pages/AuthConfirm";
import PartnerHandoff from "./pages/PartnerHandoff";
import ConfirmEmailChange from "./pages/ConfirmEmailChange";
import Dashboard from "./pages/Dashboard";
import Services from "./pages/Services";
import ServiceWorkspace from "./pages/ServiceWorkspace";
import Songs from "./pages/Songs";
import PresentOutput from "./pages/PresentOutput";
import PresentStage from "./pages/PresentStage";
import Account from "./pages/Account";
import ExitSurvey from "./pages/ExitSurvey";
import CheckoutRedirect from "./pages/CheckoutRedirect";
import Contact from "./pages/Contact";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsAndConditions from "./pages/TermsAndConditions";
import TrustCenter from "./pages/TrustCenter";
import NotFound from "./pages/NotFound";
import SessionTimeoutManager from "@/components/SessionTimeoutManager";
import ErrorBoundary from "@/components/ErrorBoundary";
import RouteTracker from "@/components/RouteTracker";
import ScrollToRouteTop from "@/components/ScrollToRouteTop";
import RecoveryRedirectHandler from "@/components/RecoveryRedirectHandler";
import AdminProtectedRoute from "@/components/admin/AdminProtectedRoute";
import AdminLayout from "@/components/admin/AdminLayout";
import AdminLogin from "./pages/admin/AdminLogin";
import AdminAcceptInvite from "./pages/admin/AdminAcceptInvite";
import AdminOverview from "./pages/admin/AdminOverview";
import AdminCustomers from "./pages/admin/AdminCustomers";
import AdminPendingSignups from "./pages/admin/AdminPendingSignups";
import AdminCustomerDetail from "./pages/admin/AdminCustomerDetail";
import AdminSupport from "./pages/admin/AdminSupport";
import AdminBilling from "./pages/admin/AdminBilling";
import AdminReports from "./pages/admin/AdminReports";
import AdminMessages from "./pages/admin/AdminMessages";
import AdminUsers from "./pages/admin/AdminUsers";

const queryClient = new QueryClient();

/** Old presenter links now open the service workspace, where services are run. */
const PresentRedirect = () => {
  const { serviceId = "" } = useParams();
  return <Navigate to={`/dashboard/services/${serviceId}`} replace />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ErrorBoundary>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ScrollToRouteTop />
          <RouteTracker />
          <AuthProvider>
            <RecoveryRedirectHandler />
            <SessionTimeoutManager />
            <DesktopGate>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/create" element={<CreateSermon />} />
              <Route path="/create/review/:id" element={<SermonReview />} />
              <Route path="/editor/:id" element={<SlideEditor />} />
              <Route path="/login" element={getDesktop() ? <DesktopLogin /> : <Login />} />
              <Route path="/signup" element={<SignUp />} />
              <Route path="/signup/complete" element={<SignupComplete />} />
              <Route path="/signup-incomplete" element={<ProtectedRoute allowUnsubscribed allowPendingCheckout><SignupIncomplete /></ProtectedRoute>} />
              <Route path="/invite-signup" element={<InviteSignUp />} />
              <Route path="/auth/confirm" element={<AuthConfirm />} />
              <Route path="/handoff/complete" element={<PartnerHandoff />} />
              <Route path="/auth/confirm-email-change" element={<ConfirmEmailChange />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route path="/admin/accept-invite" element={<AdminAcceptInvite />} />
              <Route path="/admin" element={<AdminProtectedRoute><AdminLayout /></AdminProtectedRoute>}>
                <Route index element={<AdminOverview />} />
                <Route path="customers" element={<AdminCustomers />} />
                <Route path="customers/:id" element={<AdminCustomerDetail />} />
                <Route path="pending-signups" element={<AdminPendingSignups />} />
                <Route path="support" element={<AdminSupport />} />
                <Route path="billing" element={<AdminBilling />} />
                <Route path="reports" element={<AdminReports />} />
                <Route path="messages" element={<AdminMessages />} />
                <Route path="users" element={<AdminUsers />} />
              </Route>
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/dashboard/create" element={<ProtectedRoute><CreateSermon /></ProtectedRoute>} />
              <Route path="/dashboard/create/review/:id" element={<ProtectedRoute><SermonReview /></ProtectedRoute>} />
              <Route path="/dashboard/services" element={<ProtectedRoute><Services /></ProtectedRoute>} />
              <Route path="/dashboard/services/:id" element={<ProtectedRoute><ServiceWorkspace /></ProtectedRoute>} />
              <Route path="/dashboard/songs" element={<ProtectedRoute><Songs /></ProtectedRoute>} />
              <Route path="/present/:serviceId" element={<PresentRedirect />} />
              {/* The projector window holds no data; it only shows frames the signed-in operator sends. */}
              <Route path="/present/:serviceId/output" element={<PresentOutput />} />
              <Route path="/present/:serviceId/stage" element={<PresentStage />} />
              
              <Route path="/account" element={<ProtectedRoute allowUnsubscribed><Account /></ProtectedRoute>} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/terms-and-conditions" element={<TermsAndConditions />} />
              <Route path="/trust-center" element={<TrustCenter />} />
              <Route path="/exit-survey" element={<ProtectedRoute allowUnsubscribed><ExitSurvey /></ProtectedRoute>} />
              <Route path="/checkout-redirect" element={<ProtectedRoute allowUnsubscribed allowPendingCheckout><CheckoutRedirect /></ProtectedRoute>} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
            </DesktopGate>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ErrorBoundary>
  </QueryClientProvider>
);

export default App;
