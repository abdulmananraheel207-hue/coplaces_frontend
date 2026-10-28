import { Chip } from '../../components/ui';
import type { OrgStatus } from '../../types';

export function StatusChip({ status, expired }: { status: OrgStatus; expired?: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {status === 'trial' && <Chip tone="mine">Trial</Chip>}
      {status === 'active' && <Chip tone="ok">Active</Chip>}
      {status === 'suspended' && <Chip tone="busy">Suspended</Chip>}
      {status === 'cancelled' && <Chip tone="idle">Cancelled</Chip>}
      {expired && <Chip tone="hold">Ended</Chip>}
    </span>
  );
}

export const intervalLabel = (i: 'month' | 'year') => (i === 'year' ? 'year' : 'month');
