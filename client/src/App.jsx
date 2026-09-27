import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./components/layout/AppShell.jsx";
import ProtectedRoute from "./components/layout/ProtectedRoute.jsx";
import PublicRoute from "./components/layout/PublicRoute.jsx";
import PageSkeleton from "./components/feedback/PageSkeleton.jsx";

const LoginPage = lazy(() => import("./features/auth/LoginPage.jsx"));
const RegisterPage = lazy(() => import("./features/auth/RegisterPage.jsx"));
const DashboardPage = lazy(() => import("./features/dashboard/DashboardPage.jsx"));
const TicketsPage = lazy(() => import("./features/tickets/TicketsPage.jsx"));
const TicketDetailPage = lazy(() => import("./features/tickets/TicketDetailPage.jsx"));
const CustomersPage = lazy(() => import("./features/customers/CustomersPage.jsx"));
const CustomerDetailPage = lazy(() => import("./features/customers/CustomerDetailPage.jsx"));
const KnowledgePage = lazy(() => import("./features/knowledge/KnowledgePage.jsx"));
const AIAssistantPage = lazy(() => import("./features/ai/AIAssistantPage.jsx"));
const TeamPage = lazy(() => import("./features/organization/TeamPage.jsx"));
const NotFoundPage = lazy(() => import("./features/not-found/NotFoundPage.jsx"));

function App() {
  return (
    <Suspense fallback={<PageSkeleton fullPage />}>
      <Routes>
        <Route element={<PublicRoute />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>

        <Route path="/app" element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="tickets" element={<TicketsPage />} />
            <Route path="tickets/:ticketId" element={<TicketDetailPage />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="customers/:customerId" element={<CustomerDetailPage />} />
            <Route path="knowledge" element={<KnowledgePage />} />
            <Route path="ai" element={<AIAssistantPage />} />
            <Route path="ai/:conversationId" element={<AIAssistantPage />} />
            <Route path="team" element={<TeamPage />} />
          </Route>
        </Route>

        <Route path="/" element={<Navigate to="/app/dashboard" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}

export default App;
