import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import CreateSermon from "./pages/CreateSermon";
import SlideEditor from "./pages/SlideEditor";
import PaymentSuccess from "./pages/PaymentSuccess";
import Login from "./pages/Login";
import SignUp from "./pages/SignUp";
import InviteSignUp from "./pages/InviteSignUp";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Account from "./pages/Account";
import ExitSurvey from "./pages/ExitSurvey";
import CheckoutRedirect from "./pages/CheckoutRedirect";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/create" element={<CreateSermon />} />
            <Route path="/editor/:id" element={<SlideEditor />} />
            <Route path="/payment-success" element={<PaymentSuccess />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/invite-signup" element={<InviteSignUp />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/dashboard/create" element={<ProtectedRoute><CreateSermon /></ProtectedRoute>} />
            
            <Route path="/account" element={<ProtectedRoute allowUnsubscribed><Account /></ProtectedRoute>} />
            <Route path="/exit-survey" element={<ProtectedRoute allowUnsubscribed><ExitSurvey /></ProtectedRoute>} />
            <Route path="/checkout-redirect" element={<ProtectedRoute allowUnsubscribed><CheckoutRedirect /></ProtectedRoute>} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
