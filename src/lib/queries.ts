import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { ShiftTemplate, Announcement, AttendanceRow, Booking, Dashboard, FloorObject, Holiday, Occupancy, Plan, Resource, Schedule, Visitor } from '../types';

export const useDashboard = (locationId: string) =>
  useQuery({ queryKey: ['dashboard', locationId], queryFn: () => api.get<Dashboard>('/reports/dashboard', { locationId }), refetchInterval: 60_000 });

export const useSchedule = (locationId: string, date: string) =>
  useQuery({ queryKey: ['schedule', locationId, date], queryFn: () => api.get<Schedule>('/bookings/schedule', { locationId, date }), refetchInterval: 60_000 });

export const useResources = (locationId: string) =>
  useQuery({ queryKey: ['resources', locationId], queryFn: () => api.get<Resource[]>('/resources', { locationId }) });

/** Kitchens, coffee machines and other things drawn on the floor plan. Only packages with the 3D view have them. */
export const useFloorObjects = (locationId: string, enabled = true) =>
  useQuery({ queryKey: ['floor-objects', locationId], queryFn: () => api.get<FloorObject[]>('/floor-plan/objects', { locationId }), enabled });

/** The floors a location has, named or in use, and how many the package allows (null is unlimited). */
export const useFloors = (locationId: string) =>
  useQuery({ queryKey: ['floors', locationId], queryFn: () => api.get<{ floors: string[]; limit: number | null }>('/floors', { locationId }) });

export const usePresent = (locationId: string) =>
  useQuery({
    queryKey: ['attendance', locationId, 'open'],
    queryFn: () => api.get<AttendanceRow[]>('/attendance', { locationId, open: 1 }),
    refetchInterval: 30_000,
  });

export const useVisitors = (locationId: string, params: { date?: string; status?: string }, enabled = true) =>
  useQuery({ queryKey: ['visitors', locationId, params], queryFn: () => api.get<Visitor[]>('/visitors', { locationId, ...params }), enabled });

/** Bookings starting from one date to another, both included. */
export const useBookingsRange = (locationId: string, from: string, to: string) =>
  useQuery({ queryKey: ['bookings', locationId, from, to], queryFn: () => api.get<Booking[]>('/bookings', { locationId, from, to, limit: 5000 }) });

export const useHolidays = (locationId: string, from?: string, to?: string) =>
  useQuery({ queryKey: ['holidays', locationId, from, to], queryFn: () => api.get<Holiday[]>(`/locations/${locationId}/holidays`, { from, to }) });

export const useAnnouncements = (locationId: string) =>
  useQuery({ queryKey: ['announcements', locationId], queryFn: () => api.get<Announcement[]>('/announcements', { locationId }) });

/** How busy each space has been over the last so many days. */
export const useOccupancy = (locationId: string, days: number, enabled = true) =>
  useQuery({ queryKey: ['occupancy', locationId, days], queryFn: () => api.get<Occupancy>('/reports/occupancy', { locationId, days }), enabled, staleTime: 60_000 });

/** The shifts of a location, for the booking form and for the page that manages them. With a member id, only the ones that member can use. */
export const useShifts = (locationId: string, memberId?: string, enabled = true) =>
  useQuery({ queryKey: ['shifts', locationId, memberId ?? ''], queryFn: () => api.get<ShiftTemplate[]>('/shifts', { locationId, memberId }), enabled });

export const usePlans = (locationId: string) =>
  useQuery({ queryKey: ['plans', locationId], queryFn: () => api.get<Plan[]>('/plans', { locationId }) });

/** Invalidate every cached query whose first key segment is listed. */
export function useRefresh() {
  const qc = useQueryClient();
  return (...keys: string[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [k] })));
}
