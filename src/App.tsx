import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import Layout from './components/Layout';
import { LoadingSpinner } from './components/UiPrimitives';

import LoginPage from './pages/LoginPage';
import OnboardingPage from './pages/OnboardingPage';
import DashboardPage from './pages/DashboardPage';
import ClientsPage from './pages/ClientsPage';
import BuildingsPage from './pages/BuildingsPage';
import FireDoorsPage from './pages/FireDoorsPage';
import InspectionsPage from './pages/InspectionsPage';
import DeficienciesPage from './pages/DeficienciesPage';
import RemediationPage from './pages/RemediationPage';
import EvidenceGalleryPage from './pages/EvidenceGalleryPage';
import ReportsPage from './pages/ReportsPage';
import TeamPage from './pages/TeamPage';
import SettingsPage from './pages/SettingsPage';
import ClientPortalPage from './pages/ClientPortalPage';

function WorkspaceGuard({
  children,
  clientOnly = false,
  contractorOnly = false,
}: {
  children: React.ReactNode;
  clientOnly?: boolean;
  contractorOnly?: boolean;
}) {
  const { user, workspace, loading, workspaceLoading } = useAuth();

  if (loading || (user && workspaceLoading && !workspace)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner label="Securing tenant session..." />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (workspace?.needsOnboarding) return <OnboardingPage />;

  const isClient = workspace?.member?.role === 'client';
  if (contractorOnly && isClient) return <Navigate to="/portal" replace />;
  if (clientOnly && !isClient) return <Navigate to="/" replace />;

  return <Layout>{children}</Layout>;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />

      {/* Isolated Client Portal */}
      <Route
        path="/portal"
        element={
          <WorkspaceGuard clientOnly>
            <ClientPortalPage />
          </WorkspaceGuard>
        }
      />

      {/* Contractor Operational Modules */}
      <Route path="/" element={<WorkspaceGuard contractorOnly><DashboardPage /></WorkspaceGuard>} />
      <Route path="/clients" element={<WorkspaceGuard contractorOnly><ClientsPage /></WorkspaceGuard>} />
      <Route path="/buildings" element={<WorkspaceGuard contractorOnly><BuildingsPage /></WorkspaceGuard>} />
      <Route path="/doors" element={<WorkspaceGuard contractorOnly><FireDoorsPage /></WorkspaceGuard>} />
      <Route path="/inspections" element={<WorkspaceGuard contractorOnly><InspectionsPage /></WorkspaceGuard>} />
      <Route path="/deficiencies" element={<WorkspaceGuard contractorOnly><DeficienciesPage /></WorkspaceGuard>} />
      <Route path="/remediation" element={<WorkspaceGuard contractorOnly><RemediationPage /></WorkspaceGuard>} />
      <Route path="/evidence" element={<WorkspaceGuard contractorOnly><EvidenceGalleryPage /></WorkspaceGuard>} />
      <Route path="/reports" element={<WorkspaceGuard contractorOnly><ReportsPage /></WorkspaceGuard>} />
      <Route path="/team" element={<WorkspaceGuard contractorOnly><TeamPage /></WorkspaceGuard>} />
      <Route path="/settings" element={<WorkspaceGuard contractorOnly><SettingsPage /></WorkspaceGuard>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
