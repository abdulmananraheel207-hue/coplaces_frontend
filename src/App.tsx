import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation as useRoute } from 'react-router';
import { isStaff, useAuth } from './auth';
import { RequireFeature, RequirePermission, RequireRole } from './components/FeatureGate';
import { InvoiceView } from './components/InvoiceView';
import { MemberShell, PlatformShell, StaffShell } from './components/Layout';
import { Button, Empty, Loading, PageHeader, Section } from './components/ui';
import Login from './pages/Login';
import PlatformOverview from './pages/platform/Overview';
import PlatformPackages from './pages/platform/Packages';
import PlatformPayments from './pages/platform/Payments';
import PlatformSpaceDetail from './pages/platform/SpaceDetail';
import PlatformSpaces from './pages/platform/Spaces';
import MemberBook from './pages/member/Book';
import MemberHome from './pages/member/Home';
import MemberInvoices from './pages/member/Invoices';
import MemberVisitors from './pages/member/Visitors';
import Announcements from './pages/staff/Announcements';
import Bookings from './pages/staff/Bookings';
import Contracts from './pages/staff/Contracts';
import Devices from './pages/staff/Devices';
import Maintenance from './pages/staff/Maintenance';
import SpaceScan from './pages/SpaceScan';
import Dashboard from './pages/staff/Dashboard';
import Expenses from './pages/staff/Expenses';
import FrontDesk from './pages/staff/FrontDesk';
import Invoices from './pages/staff/Invoices';
import MemberDetail from './pages/staff/MemberDetail';
import Members from './pages/staff/Members';
import { FinanceIndex, FinanceLayout } from './pages/staff/Finance';
import Payments from './pages/staff/Payments';
import Plans from './pages/staff/Plans';
import Settings, { PasswordForm } from './pages/staff/Settings';
import Spaces from './pages/staff/Spaces';

// The overview and profit and loss pages pull in the chart code, so they load on demand.
const FinanceOverview = lazy(() => import('./pages/staff/FinanceOverview'));
const ProfitLoss = lazy(() => import('./pages/staff/ProfitLoss'));

function NotFound() {
  return (
    <>
      <PageHeader title="Page not found" />
      <Empty title="There is nothing at this address" hint="Use the menu to get back on track." />
    </>
  );
}

function StaffRoutes() {
  return (
    <Routes>
      <Route element={<StaffShell />}>
        <Route index element={<Dashboard />} />
        <Route path="front-desk" element={<RequirePermission permission="front_desk"><FrontDesk /></RequirePermission>} />
        <Route path="bookings" element={<RequirePermission permission="bookings"><Bookings /></RequirePermission>} />
        <Route path="members" element={<RequirePermission permission="members"><Members /></RequirePermission>} />
        <Route path="members/:id" element={<RequirePermission permission="members"><MemberDetail /></RequirePermission>} />
        <Route path="spaces" element={<Spaces />} />
        <Route path="shifts" element={<Navigate to="/plans" replace />} />
        <Route path="money/*" element={<Navigate to="/finance" replace />} />
        <Route path="finance" element={<FinanceLayout />}>
          <Route index element={<FinanceIndex />} />
          <Route path="invoices" element={<RequireFeature feature="invoicing"><RequirePermission permission="invoices"><Invoices /></RequirePermission></RequireFeature>} />
          <Route path="invoices/:id" element={<RequireFeature feature="invoicing"><RequirePermission permission="invoices"><InvoiceView backTo="/finance/invoices" staff /></RequirePermission></RequireFeature>} />
          <Route path="payments" element={<RequireFeature feature="invoicing"><RequirePermission permission="invoices"><Payments /></RequirePermission></RequireFeature>} />
          <Route
            path="expenses"
            element={
              <RequirePermission permission="expenses">
                <RequireFeature feature="expenses">
                  <Expenses />
                </RequireFeature>
              </RequirePermission>
            }
          />
          <Route
            path="overview"
            element={
              <RequirePermission permission="reports">
                <RequireFeature feature="reports">
                  <Suspense fallback={<Loading />}>
                    <FinanceOverview />
                  </Suspense>
                </RequireFeature>
              </RequirePermission>
            }
          />
          <Route
            path="profit-loss"
            element={
              <RequirePermission permission="reports">
                <RequireFeature feature="reports">
                  <Suspense fallback={<Loading />}>
                    <ProfitLoss />
                  </Suspense>
                </RequireFeature>
              </RequirePermission>
            }
          />
        </Route>
        <Route
          path="plans"
          element={
            <RequirePermission permission="plans">
              <Plans />
            </RequirePermission>
          }
        />
        <Route
          path="contracts"
          element={
            <RequirePermission permission="contracts">
              <Contracts />
            </RequirePermission>
          }
        />
        <Route
          path="announcements"
          element={
            <RequirePermission permission="announcements">
              <Announcements />
            </RequirePermission>
          }
        />
        <Route
          path="maintenance"
          element={
            <RequirePermission permission="maintenance">
              <Maintenance />
            </RequirePermission>
          }
        />
        <Route
          path="devices"
          element={
            <RequireRole roles={['owner', 'manager']}>
              <Devices />
            </RequireRole>
          }
        />
        <Route path="s/:id" element={<SpaceScan />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

function PlatformRoutes() {
  return (
    <Routes>
      <Route element={<PlatformShell />}>
        <Route index element={<PlatformOverview />} />
        <Route path="spaces" element={<PlatformSpaces />} />
        <Route path="spaces/:id" element={<PlatformSpaceDetail />} />
        <Route path="packages" element={<PlatformPackages />} />
        <Route path="payments" element={<PlatformPayments />} />
        <Route
          path="settings"
          element={
            <>
              <PageHeader title="Settings" />
              <Section title="Change password">
                <PasswordForm />
              </Section>
            </>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

function MemberRoutes() {
  return (
    <Routes>
      <Route element={<MemberShell />}>
        <Route index element={<MemberHome />} />
        <Route path="book" element={<MemberBook />} />
        <Route path="s/:id" element={<SpaceScan />} />
        <Route path="visitors" element={<RequireFeature feature="visitors"><MemberVisitors /></RequireFeature>} />
        <Route path="invoices" element={<RequireFeature feature="invoicing"><MemberInvoices /></RequireFeature>} />
        <Route path="invoices/:id" element={<RequireFeature feature="invoicing"><InvoiceView backTo="/invoices" staff={false} /></RequireFeature>} />
        <Route
          path="account"
          element={
            <>
              <PageHeader title="Account" />
              <Section title="Change password">
                <PasswordForm />
              </Section>
            </>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

function Gate() {
  const { user, location, loading, loadError, refresh } = useAuth();
  const route = useRoute();
  if (loading) return <Loading label="Loading" />;
  if (!user && loadError) {
    return (
      <div className="mx-auto max-w-md px-4 py-20">
        <Empty
          title="Can't reach the server"
          hint="Check your connection and try again. If it keeps happening, the service may be restarting."
          action={<Button variant="primary" onClick={() => void refresh()}>Try again</Button>}
        />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: route.pathname }} />;
  if (user.role === 'superadmin') return <PlatformRoutes />;
  if (!location) {
    return (
      <div className="mx-auto max-w-md px-4 py-20">
        <Empty title="No location assigned" hint="Ask the owner to give your account access to a location." />
      </div>
    );
  }
  return isStaff(user) ? <StaffRoutes /> : <MemberRoutes />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/*" element={<Gate />} />
    </Routes>
  );
}
