import { api } from '../api';
import type {
  Amenity,
  Announcement,
  AttendanceRow,
  Booking,
  Contract,
  Dashboard,
  Expense,
  FinanceCharts,
  FinanceReport,
  FloorObject,
  Holiday,
  InvoiceRow,
  Issue,
  MemberRow,
  Occupancy,
  PaymentRow,
  Plan,
  Resource,
  RoomRequest,
  Schedule,
  ShiftTemplate,
  SpaceAsset,
  SpaceTask,
  Visitor,
} from '../types';
import { periodRange, type Period } from './financePeriod';
import { addDays, addMonths } from './time';

/**
 * One definition per query the main pages make: its cache key and how to fetch it. Pages, the shared hooks and the
 * prefetcher all use these, so data fetched ahead lands exactly where the page will look for it.
 */

export const qd = {
  dashboard: (loc: string) => ({ queryKey: ['dashboard', loc], queryFn: () => api.get<Dashboard>('/reports/dashboard', { locationId: loc }) }),
  schedule: (loc: string, date: string) => ({ queryKey: ['schedule', loc, date], queryFn: () => api.get<Schedule>('/bookings/schedule', { locationId: loc, date }) }),
  resources: (loc: string) => ({ queryKey: ['resources', loc], queryFn: () => api.get<Resource[]>('/resources', { locationId: loc }) }),
  floorObjects: (loc: string) => ({ queryKey: ['floor-objects', loc], queryFn: () => api.get<FloorObject[]>('/floor-plan/objects', { locationId: loc }) }),
  floors: (loc: string) => ({ queryKey: ['floors', loc], queryFn: () => api.get<{ floors: string[]; limit: number | null }>('/floors', { locationId: loc }) }),
  present: (loc: string) => ({ queryKey: ['attendance', loc, 'open'], queryFn: () => api.get<AttendanceRow[]>('/attendance', { locationId: loc, open: 1 }) }),
  visitors: (loc: string, params: { date?: string; status?: string }) => ({ queryKey: ['visitors', loc, params], queryFn: () => api.get<Visitor[]>('/visitors', { locationId: loc, ...params }) }),
  bookingsRange: (loc: string, from: string, to: string) => ({ queryKey: ['bookings', loc, from, to], queryFn: () => api.get<Booking[]>('/bookings', { locationId: loc, from, to, limit: 5000 }) }),
  holidays: (loc: string, from?: string, to?: string) => ({ queryKey: ['holidays', loc, from, to], queryFn: () => api.get<Holiday[]>(`/locations/${loc}/holidays`, { from, to }) }),
  announcements: (loc: string) => ({ queryKey: ['announcements', loc], queryFn: () => api.get<Announcement[]>('/announcements', { locationId: loc }) }),
  occupancy: (loc: string, days: number) => ({ queryKey: ['occupancy', loc, days], queryFn: () => api.get<Occupancy>('/reports/occupancy', { locationId: loc, days }) }),
  shifts: (loc: string, memberId?: string) => ({ queryKey: ['shifts', loc, memberId ?? ''], queryFn: () => api.get<ShiftTemplate[]>('/shifts', { locationId: loc, memberId }) }),
  amenities: (loc: string) => ({ queryKey: ['amenities', loc], queryFn: () => api.get<Amenity[]>('/amenities', { locationId: loc }) }),
  plans: (loc: string) => ({ queryKey: ['plans', loc], queryFn: () => api.get<Plan[]>('/plans', { locationId: loc }) }),
  members: (loc: string) => ({ queryKey: ['members', loc], queryFn: () => api.get<MemberRow[]>('/members', { locationId: loc }) }),
  contracts: (loc: string) => ({ queryKey: ['contracts', loc], queryFn: () => api.get<Contract[]>('/contracts', { locationId: loc }) }),
  assignments: (loc: string) => ({
    queryKey: ['assignments', loc],
    queryFn: () => api.get<{ id: string; resourceId: string; startDate: string; endDate: string | null }[]>('/assignments', { locationId: loc }),
  }),
  pendingRequests: (loc: string) => ({ queryKey: ['requests', loc, 'pending'], queryFn: () => api.get<RoomRequest[]>('/requests', { locationId: loc, status: 'pending' }) }),
  invoices: (loc: string, status: string, search: string) => ({ queryKey: ['invoices', loc, status, search], queryFn: () => api.get<InvoiceRow[]>('/invoices', { locationId: loc, status, q: search }) }),
  /** The finance report for a period, remembering which period it is for. */
  financeReport: (loc: string, today: string, months: Period) => {
    const { from, to } = periodRange(months, today);
    return {
      queryKey: ['reports', loc, from, to],
      queryFn: async (): Promise<FinanceReport & { months: Period }> => ({ ...(await api.get<FinanceReport>('/reports/finance', { locationId: loc, from, to })), months }),
    };
  },
  /** The finance charts (month-end balances, invoices by status, debtors, income mix) for the same period as the report. */
  financeCharts: (loc: string, today: string, months: Period) => {
    const { from, to } = periodRange(months, today);
    return {
      queryKey: ['reports', loc, from, to, 'charts'],
      queryFn: () => api.get<FinanceCharts>('/reports/finance/charts', { locationId: loc, from, to }),
    };
  },
  /** Expenses of one month (YYYY-MM), or of every month when it is empty, optionally of one category. */
  expenses: (loc: string, month: string, category: string) => {
    const from = month ? `${month}-01` : undefined;
    const to = month ? addDays(`${addMonths(month, 1)}-01`, -1) : undefined;
    return { queryKey: ['expenses', loc, month, category], queryFn: () => api.get<Expense[]>('/expenses', { locationId: loc, from, to, category }) };
  },
  payments: (loc: string, from: string, to: string, method: string) => ({ queryKey: ['payments', loc, from, to, method], queryFn: () => api.get<PaymentRow[]>('/payments', { locationId: loc, from, to, method }) }),
  issues: (loc: string, space: string) => ({ queryKey: ['issues', loc, space], queryFn: () => api.get<Issue[]>('/issues', { locationId: loc, resourceId: space || undefined }) }),
  tasks: (loc: string, space: string) => ({ queryKey: ['tasks', loc, space], queryFn: () => api.get<SpaceTask[]>('/tasks', { locationId: loc, resourceId: space || undefined }) }),
  assets: (loc: string, space: string, status: string) => ({
    queryKey: ['assets', loc, space, status],
    queryFn: () => api.get<SpaceAsset[]>('/assets', { locationId: loc, resourceId: space || undefined, status: status || undefined }),
  }),
};
