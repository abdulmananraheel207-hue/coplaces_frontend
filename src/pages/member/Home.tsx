import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '../../api';
import { useAuth, useFeature, useLocation } from '../../auth';
import { ReportProblem } from '../../components/ReportProblem';
import { useToast } from '../../components/toast';
import { Button, Chip, ErrorNote, Ledger, Loading, PageHeader, Section } from '../../components/ui';
import { KIND_LABEL, money } from '../../lib/format';
import { useAnnouncements, useRefresh } from '../../lib/queries';
import { fmtDate, fmtDateTime, fmtDay, fmtDuration, fmtTime, localDateOf } from '../../lib/time';
import type { Issue, MemberSummary } from '../../types';

const ISSUE_WORD = { open: 'Reported', in_progress: 'Being fixed', resolved: 'Fixed' } as const;
const ISSUE_TONE = { open: 'hold', in_progress: 'mine', resolved: 'ok' } as const;

/** Something not right? Report it, and see what happened to what you reported before. */
function Problems() {
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ['issues', loc.id, 'mine'], queryFn: () => api.get<Issue[]>('/issues', { locationId: loc.id }) });
  const recent = (q.data ?? []).slice(0, 4);
  return (
    <Section title="Something not right?" aside={<Button small onClick={() => setOpen(true)}>Report a problem</Button>}>
      {recent.length === 0 ? (
        <p className="text-sm text-slate">Tell us if a room, desk or anything else needs attention. You can also scan the QR code on a desk.</p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {recent.map((i) => (
            <li key={i.id} className="py-2 text-sm">
              <span className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">{i.title}</span>
                <Chip tone={ISSUE_TONE[i.status]}>{ISSUE_WORD[i.status]}</Chip>
              </span>
              <span className="block text-xs text-slate">{i.resourceName}</span>
              {i.resolution && <span className="block text-xs text-ok">{i.resolution}</span>}
            </li>
          ))}
        </ul>
      )}
      <ReportProblem open={open} onClose={() => setOpen(false)} />
    </Section>
  );
}

export default function MemberHome() {
  const { user } = useAuth();
  const hasVisitors = useFeature('visitors');
  const toast = useToast();
  const refresh = useRefresh();
  const q = useQuery({ queryKey: ['summary'], queryFn: () => api.get<MemberSummary>('/me/summary') });
  const news = useAnnouncements(useLocation().id);
  const [pending, setPending] = useState<string | null>(null);

  const checkIn = useMutation({
    mutationFn: () => api.post('/attendance/check-in', {}),
    onSuccess: () => {
      toast.ok('You are checked in');
      void refresh('summary');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const checkOut = useMutation({
    mutationFn: (id: string) => api.post(`/attendance/${id}/check-out`),
    onSuccess: () => {
      toast.ok('You are checked out');
      void refresh('summary');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => {
      setPending(id);
      return api.post(`/bookings/${id}/cancel`);
    },
    onSuccess: () => {
      toast.ok('Booking cancelled');
      void refresh('summary', 'schedule', 'bookings');
    },
    onError: (e) => toast.error(errorMessage(e)),
    onSettled: () => setPending(null),
  });

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorNote error={q.error} />;
  const s = q.data;
  const first = user?.name.split(' ')[0] ?? '';
  const mm = s.meetingMinutes;
  const pct = mm.included ? Math.min(100, (mm.used / mm.included) * 100) : 0;

  return (
    <>
      <PageHeader title={`Hello, ${first}`} sub={[s.member.company, s.plan?.name].filter(Boolean).join(', ') || s.member.locationName} />

      {news.data && news.data.length > 0 && (
        <ul className="mb-8 space-y-2" aria-label="Announcements">
          {news.data.slice(0, 3).map((a) => (
            <li key={a.id} className="surface border-l-[6px] border-l-signal-deep px-4 py-3">
              <p className="font-semibold">{a.title}</p>
              {a.body && <p className="mt-0.5 whitespace-pre-line text-sm">{a.body}</p>}
            </li>
          ))}
        </ul>
      )}

      {s.balanceDueCents > 0 && (
        <div className={`mb-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${s.overdueCents > 0 ? 'border-busy bg-busy-wash' : 'border-signal-deep bg-hold-wash'}`}>
          <p className="text-sm">
            <strong>{money(s.balanceDueCents, s.currency)}</strong> due{s.overdueCents > 0 ? `, ${money(s.overdueCents, s.currency)} of it overdue` : ''}.
          </p>
          <Link to="/invoices" className="text-sm font-semibold underline underline-offset-2">
            See invoices
          </Link>
        </div>
      )}

      {s.amenityDueCents > 0 && (
        <div className="mb-8 rounded-xl border border-signal-deep bg-hold-wash px-4 py-3 text-sm">
          <strong>{money(s.amenityDueCents, s.currency)}</strong> to pay at the front desk for tea, coffee or food beyond your free amount.
        </div>
      )}

      <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-9">
          <Section title="Today at the space">
            {s.checkedIn ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border border-ok bg-ok-wash px-4 py-3">
                <p className="text-sm font-semibold text-ok">You checked in at {fmtTime(s.checkedIn.checkInAt, s.timezone)}.</p>
                <Button onClick={() => checkOut.mutate(s.checkedIn!.id)} disabled={checkOut.isPending}>
                  Check out
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 surface px-4 py-3">
                <p className="text-sm">You are not checked in.</p>
                <Button variant="primary" onClick={() => checkIn.mutate()} disabled={checkIn.isPending || s.member.status !== 'active'}>
                  Check in
                </Button>
              </div>
            )}
          </Section>

          <Section title="Your upcoming bookings" aside={<Link to="/book" className="font-semibold text-ink underline underline-offset-2">Request a room</Link>}>
            {s.upcomingBookings.length === 0 ? (
              <p className="text-sm text-slate">Nothing booked. Your plan's desk shows here, and you can ask for a meeting room on the Request a room page.</p>
            ) : (
              <ul className="surface divide-y divide-line px-4">
                {s.upcomingBookings.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                    <div>
                      <p className="font-semibold">{b.resourceName}</p>
                      <p className="num text-sm text-slate">
                        {b.allDay ? `${fmtDay(localDateOf(b.startsAt, s.timezone))}, all day` : `${fmtDateTime(b.startsAt, s.timezone)} to ${fmtTime(b.endsAt, s.timezone)}`}
                        {', '}
                        {KIND_LABEL[b.resourceKind].toLowerCase()}
                        {b.priceCents > 0 ? `, ${money(b.priceCents, s.currency)}` : ', included'}
                      </p>
                    </div>
                    {!b.invoiceId && (
                      <Button small variant="ghost" disabled={pending === b.id} onClick={() => cancel.mutate(b.id)}>
                        Cancel
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {hasVisitors && (
          <Section title="Visitors you are expecting" aside={<Link to="/visitors" className="font-semibold text-ink underline underline-offset-2">Manage visitors</Link>}>
            {s.expectedVisitors.length === 0 ? (
              <p className="text-sm text-slate">No visitors expected. Tell the front desk ahead of time and they will be ready.</p>
            ) : (
              <ul className="surface divide-y divide-line px-4">
                {s.expectedVisitors.map((v) => (
                  <li key={v.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                    <span className="font-semibold">{v.name}</span>
                    <span className="num text-slate">{fmtDateTime(v.expectedAt, s.timezone)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          )}
        </div>

        <aside className="space-y-9">
          <Problems />

          <Section title="Meeting room time">
            {mm.included > 0 ? (
              <>
                <p className="mb-2 text-sm">
                  <strong className="num">{fmtDuration(mm.used)}</strong> of {fmtDuration(mm.included)} included this month used.
                </p>
                <div className="h-2.5 overflow-hidden rounded-full bg-plaster" role="progressbar" aria-valuenow={mm.used} aria-valuemin={0} aria-valuemax={mm.included} aria-label="Included meeting minutes used">
                  <div className={`h-full rounded-full ${pct >= 100 ? 'bg-busy' : 'bg-ink'}`} style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-2 text-xs text-slate">After that, rooms are charged by the hour and added to your next invoice.</p>
              </>
            ) : (
              <p className="text-sm text-slate">Your plan has no included meeting time. Rooms are charged by the hour and added to your next invoice.</p>
            )}
          </Section>

          {s.amenities.length > 0 && (
            <Section title="Free every day">
              <ul className="surface divide-y divide-line px-4 text-sm">
                {s.amenities.map((a) => (
                  <li key={a.amenityId} className="flex items-baseline justify-between gap-3 py-2">
                    <span className="font-semibold">{a.name}</span>
                    <span className="num text-slate">
                      {Math.min(a.usedToday, a.freePerDay)} of {a.freePerDay} used today
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-slate">After your free ones: {s.amenities.map((a) => `${a.name} ${money(a.priceCents, s.currency)}`).join(', ')} each.</p>
            </Section>
          )}

          <Section title="Your plan">
            {s.plan ? (
              <Ledger
                rows={[
                  { label: 'Plan', value: s.plan.name },
                  { label: 'Billed', value: s.plan.interval === 'month' ? 'Monthly' : 'Day pass' },
                  { label: 'Hot desks', value: s.plan.includesHotDesk ? 'Included' : 'Pay per day' },
                  { label: 'Status', value: <Chip tone={s.member.status === 'active' ? 'ok' : 'hold'}>{s.member.status}</Chip> },
                ]}
              />
            ) : (
              <p className="text-sm text-slate">You are not on a plan yet. Ask the front desk about options.</p>
            )}
            <p className="mt-2 text-xs text-slate">Today is {fmtDate(s.today)}.</p>
          </Section>
        </aside>
      </div>
    </>
  );
}
