import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { MainLayout } from "@/features/pages/MainLayout";
import { AuthLayout } from "@/features/pages/AuthLayout";
import { Login } from "@/features/auth/pages/Login";
import { Register } from "@/features/auth/pages/Register";
import { ProtectedRoute } from "@/shared/components/ProtectedRoute";
import { ROUTES } from "@/shared/constants/routes";
import { useStore } from "@/shared/store/useStore";

// ── Lazy pages ──
const ClientDashboard     = lazy(() => import("@/features/client/pages/ClientDashboard").then(m => ({ default: m.ClientDashboard })));
const ServiceRequest      = lazy(() => import("@/features/client/pages/ServiceRequest").then(m => ({ default: m.ServiceRequest })));
const JobTracking         = lazy(() => import("@/features/client/pages/JobTracking").then(m => ({ default: m.JobTracking })));
const JobCompleted        = lazy(() => import("@/features/client/pages/JobCompleted").then(m => ({ default: m.JobCompleted })));
const ClientProfile       = lazy(() => import("@/features/client/pages/ClientProfile").then(m => ({ default: m.ClientProfile })));
const ClientSettings      = lazy(() => import("@/features/client/pages/ClientSettings").then(m => ({ default: m.ClientSettings })));
const PaymentMethods      = lazy(() => import("@/features/client/pages/PaymentMethods").then(m => ({ default: m.PaymentMethods })));
const ClientProposal      = lazy(() => import("@/features/client/pages/ClientProposal").then(m => ({ default: m.ClientProposal })));
const ProviderDashboard   = lazy(() => import("@/features/provider/pages/ProviderDashboard").then(m => ({ default: m.ProviderDashboard })));
const ServiceDetail       = lazy(() => import("@/features/provider/pages/ServiceDetail").then(m => ({ default: m.ServiceDetail })));
const ActiveJob           = lazy(() => import("@/features/provider/pages/ActiveJob").then(m => ({ default: m.ActiveJob })));
const ProviderCompletedJob = lazy(() => import("@/features/provider/pages/ProviderCompletedJob").then(m => ({ default: m.ProviderCompletedJob })));
const ProviderReviews     = lazy(() => import("@/features/provider/pages/ProviderReviews").then(m => ({ default: m.ProviderReviews })));
const Notifications       = lazy(() => import("@/features/notifications/Notifications").then(m => ({ default: m.Notifications })));
const AliadosDashboard    = lazy(() => import("@/features/aliados/AliadosDashboard"));

// ── Loader ──
const PageLoader = () => (
  <div className="flex h-screen w-full items-center justify-center bg-slate-50 dark:bg-dark-bg">
    <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-brand-600 dark:border-dark-brand border-t-transparent" />
  </div>
);

// ── Root redirect: si está autenticado va al dashboard, si no al login ──
function RootRedirect() {
  const { isAuthenticated, user } = useStore();
  if (isAuthenticated && user) {
    if (user.role === 'PROVIDER') return <Navigate to={ROUTES.PROVIDER.DASHBOARD} replace />;
    if (user.role === 'ADMIN')    return <Navigate to={`/${ROUTES.ADMIN}`} replace />;
    return <Navigate to={ROUTES.CLIENT.DASHBOARD} replace />;
  }
  return <Navigate to={ROUTES.LOGIN} replace />;
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>

          {/* ── Root ── */}
          <Route path="/" element={<RootRedirect />} />

          {/* ── Auth (sin footer, header mínimo) ── */}
          <Route element={<AuthLayout />}>
            <Route path="login"   element={<Login />} />
            <Route path="registro" element={<Register />} />
          </Route>

          {/* ── App (con header + footer) ── */}
          <Route element={<MainLayout />}>

            {/* Cliente */}
            <Route element={<ProtectedRoute allowedRoles={['CLIENT']} />}>
              <Route path={ROUTES.CLIENT.ROOT}>
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard"         element={<ClientDashboard />} />
                <Route path="pedido-de-servicio" element={<ServiceRequest />} />
                <Route path="seguimiento/:jobId" element={<JobTracking />} />
                <Route path="completado/:jobId"  element={<JobCompleted />} />
                <Route path="propuesta/:jobId"   element={<ClientProposal />} />
                <Route path="notificaciones"     element={<Notifications />} />
                <Route path="perfil"             element={<ClientProfile />} />
                <Route path="configuracion"      element={<ClientSettings />} />
                <Route path="metodos-de-pago"    element={<PaymentMethods />} />
              </Route>
            </Route>

            {/* Proveedor */}
            <Route element={<ProtectedRoute allowedRoles={['PROVIDER']} />}>
              <Route path={ROUTES.PROVIDER.ROOT}>
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard"          element={<ProviderDashboard />} />
                <Route path="trabajo/:id"        element={<ServiceDetail />} />
                <Route path="trabajo-activo/:id" element={<ActiveJob />} />
                <Route path="completado/:jobId"  element={<ProviderCompletedJob />} />
                <Route path="notificaciones"     element={<Notifications />} />
                <Route path="perfil"             element={<ClientProfile />} />
                <Route path="configuracion"      element={<ClientSettings />} />
                <Route path="resenas"            element={<ProviderReviews />} />
              </Route>
            </Route>

            {/* Admin */}
            <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
              <Route path={ROUTES.ADMIN} element={<AliadosDashboard />} />
            </Route>

          </Route>

          {/* ── 404 ── */}
          <Route path="*" element={<Navigate to="/" replace />} />

        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
