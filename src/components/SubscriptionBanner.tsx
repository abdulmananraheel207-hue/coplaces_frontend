import { useAuth } from '../auth';
import { fmtDate, todayIn } from '../lib/time';
import { daysBetween } from '../lib/time';

/** Tells the owner when the trial is running out or the subscription has lapsed. */
export function SubscriptionBanner() {
  const { org, user } = useAuth();
  if (!org || !user || user.role !== 'owner') return null;
  const left = daysBetween(todayIn('Asia/Karachi'), org.periodEnd);

  if (org.expired) {
    return (
      <p role="status" className="no-print mb-5 rounded-xl border border-busy/25 bg-busy-wash px-4 py-2.5 text-sm">
        <strong>Your {org.status === 'trial' ? 'trial' : 'subscription'} ended on {fmtDate(org.periodEnd)}.</strong> Everything still works, but please contact Coplaces to renew so access is not interrupted.
      </p>
    );
  }
  if (org.status === 'trial') {
    return (
      <p role="status" className="no-print mb-5 rounded-xl border border-signal-deep/30 bg-hold-wash px-4 py-2.5 text-sm">
        <strong>Free trial:</strong> {left <= 0 ? 'ends today' : `${left} ${left === 1 ? 'day' : 'days'} left`} (until {fmtDate(org.periodEnd)}). Contact Coplaces to choose a package.
      </p>
    );
  }
  if (left >= 0 && left <= 7) {
    return (
      <p role="status" className="no-print mb-5 rounded-xl border border-signal-deep/30 bg-hold-wash px-4 py-2.5 text-sm">
        Your {org.packageName} subscription renews by <strong>{fmtDate(org.periodEnd)}</strong>.
      </p>
    );
  }
  return null;
}
