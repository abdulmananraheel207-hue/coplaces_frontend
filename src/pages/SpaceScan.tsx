import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Flag, LogIn, Wrench } from 'lucide-react';
import { api, errorMessage } from '../api';
import { useAuth, useLocation } from '../auth';
import { PhotoStrip } from '../components/Photos';
import { ReportProblem } from '../components/ReportProblem';
import { useToast } from '../components/toast';
import { Button, buttonClass, Chip, Empty, ErrorNote, Loading, PageHeader, Section } from '../components/ui';
import { isDeskKind, resourceLabel } from '../lib/catalogue';
import { KIND_LABEL } from '../lib/format';
import { can } from '../lib/permissions';
import { useRefresh } from '../lib/queries';
import { STATUS_WORD } from '../lib/spaceState';
import type { Issue, Resource } from '../types';

/**
 * Where a space's QR code leads. It shows what the space is, and offers what makes sense for the person scanning:
 * checking in at a desk, reporting a problem, and for the team, what is open against it.
 */
export default function SpaceScan() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const [reporting, setReporting] = useState(false);
  const space = useQuery({ queryKey: ['resource', id], queryFn: () => api.get<Resource>(`/resources/${id}`), retry: false });
  const team = user?.role !== 'member';
  const maintenance = can(user, 'maintenance');
  const issues = useQuery({
    queryKey: ['issues', loc.id, 'space', id],
    queryFn: () => api.get<Issue[]>('/issues', { locationId: loc.id, resourceId: id }),
    enabled: space.isSuccess,
  });

  const checkIn = useMutation({
    mutationFn: () => api.post('/attendance/check-in', team ? { memberId: undefined, resourceId: id } : { resourceId: id }),
    onSuccess: () => {
      toast.ok('You are checked in');
      void refresh('summary', 'attendance', 'dashboard', 'schedule');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (space.isLoading) return <Loading />;
  if (space.error || !space.data) {
    return (
      <>
        <PageHeader title="Space" />
        <Empty title="That space could not be opened" hint="It may be at another location. Use the location switcher, then scan again." action={<Link to="/" className={buttonClass()}>Go to the home page</Link>} />
      </>
    );
  }
  const r = space.data;
  const open = (issues.data ?? []).filter((i) => i.status !== 'resolved');
  const mine = open.filter((i) => i.reportedById === user?.id);

  return (
    <>
      <PageHeader title={r.name} sub={`${resourceLabel(r.kind, r.style)}${r.floor ? `, floor ${r.floor}` : ''}`}>
        <Chip tone={r.status === 'available' ? 'ok' : 'hold'}>{STATUS_WORD[r.status]}</Chip>
      </PageHeader>

      <div className="grid max-w-3xl gap-8">
        <div className="flex flex-wrap gap-2">
          {isDeskKind(r.kind) && r.status === 'available' && !team && (
            <Button variant="primary" onClick={() => checkIn.mutate()} disabled={checkIn.isPending}>
              <LogIn size={16} aria-hidden /> Check in here
            </Button>
          )}
          <Button onClick={() => setReporting(true)}>
            <Flag size={16} aria-hidden /> Report a problem
          </Button>
          {maintenance && (
            <Link to={`/maintenance?space=${r.id}`} className={buttonClass()}>
              <Wrench size={16} aria-hidden /> Maintenance for this space
            </Link>
          )}
          <Link to={team ? '/bookings' : '/book'} className={buttonClass()}>
            {team ? 'Open bookings' : 'Request a room'}
          </Link>
        </div>
        {checkIn.error && <ErrorNote error={checkIn.error} />}

        <Section title="About this space">
          <dl className="surface divide-y divide-line px-4 text-sm">
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-slate">Kind</dt>
              <dd className="font-semibold">{KIND_LABEL[r.kind]}</dd>
            </div>
            {r.capacity > 1 && (
              <div className="flex justify-between gap-4 py-2.5">
                <dt className="text-slate">Seats</dt>
                <dd className="font-semibold">{r.capacity}</dd>
              </div>
            )}
            {r.amenities && (
              <div className="flex justify-between gap-4 py-2.5">
                <dt className="text-slate">It offers</dt>
                <dd className="text-right font-semibold">{r.amenities}</dd>
              </div>
            )}
            {r.openTime && r.closeTime && (
              <div className="flex justify-between gap-4 py-2.5">
                <dt className="text-slate">Open</dt>
                <dd className="font-semibold">
                  {r.openTime} to {r.closeTime}
                </dd>
              </div>
            )}
          </dl>
          {r.description && <p className="mt-3 max-w-prose text-sm whitespace-pre-line">{r.description}</p>}
          {!!r.photoIds?.length && (
            <div className="mt-3">
              <PhotoStrip ids={r.photoIds} name={r.name} />
            </div>
          )}
        </Section>

        {(maintenance ? open : mine).length > 0 && (
          <Section title={maintenance ? 'Open problems here' : 'Problems you reported here'}>
            <ul className="surface divide-y divide-line px-4">
              {(maintenance ? open : mine).map((i) => (
                <li key={i.id} className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
                  <span className="font-semibold">{i.title}</span>
                  <Chip tone={i.priority === 'urgent' ? 'busy' : i.status === 'in_progress' ? 'mine' : 'hold'}>{i.status === 'in_progress' ? 'Being fixed' : 'Reported'}</Chip>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>

      <ReportProblem open={reporting} onClose={() => setReporting(false)} resourceId={r.id} />
    </>
  );
}
