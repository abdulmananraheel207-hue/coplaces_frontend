import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api';
import { CountBars } from '../../components/Bars';
import { Chip, ErrorNote, Ledger, Loading, PageHeader, Section, buttonClass } from '../../components/ui';
import { money, moneyWhole, plural } from '../../lib/format';
import { fmtDate } from '../../lib/time';
import type { PlatformOverview } from '../../types';
import { StatusChip } from './common';

export default function PlatformOverviewPage() {
  const q = useQuery({ queryKey: ['platform', 'overview'], queryFn: () => api.get<PlatformOverview>('/platform/overview') });
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorNote error={q.error} />;
  const o = q.data;

  return (
    <>
      <PageHeader title="Platform overview" sub="Every coworking space on Coplaces, and what they pay.">
        <Link to="/spaces?register=1" className={buttonClass('primary')}>
          Register a coworking space
        </Link>
        <Link to="/packages" className={buttonClass()}>
          Manage packages
        </Link>
      </PageHeader>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-9">
          <Section title="Needs attention" aside="Subscriptions ending within 14 days, or already ended">
            {o.attention.length === 0 ? (
              <p className="text-sm text-slate">Every subscription is paid up for at least two weeks.</p>
            ) : (
              <div className="surface-table">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Coworking space</th>
                      <th>Package</th>
                      <th>Status</th>
                      <th>Valid until</th>
                      <th className="r">Days left</th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.attention.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <Link to={`/spaces/${a.id}`} className="font-semibold underline-offset-2 hover:underline">
                            {a.name}
                          </Link>
                        </td>
                        <td>{a.package}</td>
                        <td>
                          <StatusChip status={a.status} />
                        </td>
                        <td className="num whitespace-nowrap">{fmtDate(a.periodEnd)}</td>
                        <td className={`r font-semibold ${a.daysLeft < 0 ? 'text-busy' : ''}`}>{a.daysLeft < 0 ? `${-a.daysLeft} overdue` : a.daysLeft}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title="Recently registered" aside={<Link to="/spaces" className="font-semibold text-ink underline underline-offset-2">All spaces</Link>}>
            <ul className="surface divide-y divide-line px-4">
              {o.recent.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <div>
                    <Link to={`/spaces/${s.id}`} className="font-semibold underline-offset-2 hover:underline">
                      {s.name}
                    </Link>
                    <p className="text-xs text-slate">
                      {[s.city, s.package.name, plural(s.usage.members, 'member')].filter(Boolean).join(', ')}
                    </p>
                  </div>
                  <StatusChip status={s.status} />
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Spaces by package">
            <CountBars rows={o.byPackage.map((p) => ({ label: p.name, count: p.tenants }))} />
          </Section>
        </div>

        <aside className="space-y-9">
          <Section title="Revenue">
            <Ledger
              rows={[
                { label: 'Monthly recurring', value: moneyWhole(o.mrrCents, o.currency), note: 'Active subscriptions, yearly plans spread over 12 months' },
                { label: 'Collected this month', value: money(o.collectedThisMonthCents, o.currency) },
              ]}
            />
          </Section>
          <Section title="Coworking spaces">
            <Ledger
              rows={[
                { label: 'Total', value: o.organizations.total },
                { label: 'Active', value: o.organizations.active, tone: 'ok' },
                { label: 'On trial', value: o.organizations.trial },
                { label: 'Suspended', value: o.organizations.suspended, tone: o.organizations.suspended ? 'busy' : undefined },
                { label: 'Subscription ended', value: o.organizations.expired, tone: o.organizations.expired ? 'busy' : undefined },
              ]}
            />
          </Section>
          <Section title="On the platform">
            <Ledger
              rows={[
                { label: 'Locations', value: o.people.locations },
                { label: 'Members', value: o.people.members },
                { label: 'Staff accounts', value: o.people.staff },
              ]}
            />
            <p className="mt-3 text-xs text-slate">
              <Chip tone="idle">{o.today}</Chip> in Pakistan time.
            </p>
          </Section>
        </aside>
      </div>
    </>
  );
}
