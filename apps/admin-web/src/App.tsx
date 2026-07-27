import { Navigate, Route, Routes } from 'react-router-dom';

import { ProtectedRoute } from './auth/protected-route';
import { AppLayout } from './layout/app-layout';
import { LoginPage } from './pages/login.page';
import { DashboardPage } from './pages/dashboard.page';
import { TravelersListPage } from './pages/travelers/travelers-list.page';
import { CoveragesListPage } from './pages/coverages/coverages-list.page';
import { TripsListPage } from './pages/trips/trips-list.page';
import { CasesListPage } from './pages/cases/cases-list.page';
import { CaseDetailPage } from './pages/cases/case-detail.page';
import { AuditLogPage } from './pages/audit/audit-log.page';
import { MedicalCentersPage } from './pages/medical-centers/medical-centers.page';
import { PlaceholderPage } from './pages/placeholder.page';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/travelers" element={<TravelersListPage />} />
          <Route path="/coverages" element={<CoveragesListPage />} />
          <Route path="/trips" element={<TripsListPage />} />
          <Route path="/cases" element={<CasesListPage />} />
          <Route path="/cases/:id" element={<CaseDetailPage />} />
          <Route path="/medical-centers" element={<MedicalCentersPage />} />
          <Route
            path="/professionals"
            element={<PlaceholderPage title="Profesionales" />}
          />
          <Route path="/audit" element={<AuditLogPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
