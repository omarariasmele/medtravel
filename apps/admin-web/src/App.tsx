import { Navigate, Route, Routes } from 'react-router-dom';

import { ProtectedRoute } from './auth/protected-route';
import { AppLayout } from './layout/app-layout';
import { LoginPage } from './pages/login.page';
import { ForgotPasswordPage } from './pages/forgot-password.page';
import { ResetPasswordPage } from './pages/reset-password.page';
import { DashboardPage } from './pages/dashboard.page';
import { TravelersListPage } from './pages/travelers/travelers-list.page';
import { TravelerDetailPage } from './pages/travelers/traveler-detail.page';
import { CoveragesListPage } from './pages/coverages/coverages-list.page';
import { TripsListPage } from './pages/trips/trips-list.page';
import { CasesListPage } from './pages/cases/cases-list.page';
import { CaseDetailPage } from './pages/cases/case-detail.page';
import { AuditLogPage } from './pages/audit/audit-log.page';
import { MedicalCentersPage } from './pages/medical-centers/medical-centers.page';
import { ProfessionalsPage } from './pages/professionals/professionals.page';
import { OperatorsPage } from './pages/operators/operators.page';
import { CatalogsAdminPage } from './pages/catalogs/catalogs-admin.page';
import { TenantsPage } from './pages/tenants/tenants.page';
import { SmtpSettingsPage } from './pages/smtp/smtp-settings.page';
import { TestConsentsPage } from './pages/test-consents/test-consents.page';
import { PartnerRecordsPage } from './pages/partner-records/partner-records.page';
import { AssistancePlansPage } from './pages/assistance-plans/assistance-plans.page';
import { PublicSharePage } from './pages/public-share/public-share.page';
import { ProfessionalRegistrationPage } from './pages/professional-registration/professional-registration.page';
import { SharePreviewPage } from './pages/share-preview/share-preview.page';
import { AiConsumptionPage } from './pages/ai-consumption/ai-consumption.page';
import { TravelersWithoutCoveragePage } from './pages/travelers-without-coverage/travelers-without-coverage.page';
import { HealthcarePlansPage } from './pages/healthcare-plans/healthcare-plans.page';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/public/shares/:token" element={<PublicSharePage />} />
      <Route path="/professional-registration" element={<ProfessionalRegistrationPage />} />
      <Route path="/share-preview/:personId" element={<SharePreviewPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/travelers" element={<TravelersListPage />} />
          <Route path="/travelers/:id" element={<TravelerDetailPage />} />
          <Route path="/coverages" element={<CoveragesListPage />} />
          <Route path="/trips" element={<TripsListPage />} />
          <Route path="/cases" element={<CasesListPage />} />
          <Route path="/cases/:id" element={<CaseDetailPage />} />
          <Route path="/medical-centers" element={<MedicalCentersPage />} />
          <Route path="/professionals" element={<ProfessionalsPage />} />
          <Route path="/audit" element={<AuditLogPage />} />
          <Route path="/operators" element={<OperatorsPage />} />
          <Route path="/catalogs-admin" element={<CatalogsAdminPage />} />
          <Route path="/tenants" element={<TenantsPage />} />
          <Route path="/smtp-settings" element={<SmtpSettingsPage />} />
          <Route path="/test-consents" element={<TestConsentsPage />} />
          <Route path="/partner-records" element={<PartnerRecordsPage />} />
          <Route path="/assistance-plans" element={<AssistancePlansPage />} />
          <Route path="/ai-consumption" element={<AiConsumptionPage />} />
          <Route path="/travelers-without-coverage" element={<TravelersWithoutCoveragePage />} />
          <Route path="/healthcare-plans" element={<HealthcarePlansPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
