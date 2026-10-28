import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import type { MemberRow } from '../types';
import { Select } from './ui';

export function useMembers(locationId: string) {
  return useQuery({ queryKey: ['members', locationId], queryFn: () => api.get<MemberRow[]>('/members', { locationId }) });
}

export function MemberSelect({
  locationId,
  value,
  onChange,
  activeOnly = true,
  required,
}: {
  locationId: string;
  value: string;
  onChange: (id: string) => void;
  activeOnly?: boolean;
  required?: boolean;
}) {
  const { data = [], isLoading } = useMembers(locationId);
  const options = data.filter((m) => !activeOnly || m.status === 'active');
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} required={required} disabled={isLoading}>
      <option value="">{isLoading ? 'Loading members…' : 'Choose a member'}</option>
      {options.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
          {m.company ? ` (${m.company})` : ''}
        </option>
      ))}
    </Select>
  );
}
