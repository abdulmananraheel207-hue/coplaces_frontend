import { useQuery, useQueryClient } from '@tanstack/react-query';
import { qd } from './queryDefs';
import { api } from '../api';
import type { Amenity, AmenityRequest, Overstay, ShiftTemplate, Announcement, AttendanceRow, Booking, Dashboard, FloorObject, Holiday, Occupancy, Plan, Resource, Schedule, Visitor } from '../types';

export const useDashboard = (locationId: string) =>
  useQuery({ ...qd.dashboard(locationId), refetchInterval: 60_000 });

export const useSchedule = (locationId: string, date: string) =>
  useQuery({ ...qd.schedule(locationId, date), refetchInterval: 60_000 });

export const useResources = (locationId: string) =>
  useQuery(qd.resources(locationId));

/** Kitchens, coffee machines and other things drawn on the floor plan. Only packages with the 3D view have them. */
export const useFloorObjects = (locationId: string, enabled = true) =>
  useQuery({ ...qd.floorObjects(locationId), enabled });

/** The floors a location has, named or in use, and how many the package allows (null is unlimited). */
export const useFloors = (locationId: string) =>
  useQuery(qd.floors(locationId));

export const usePresent = (locationId: string) =>
  useQuery({ ...qd.present(locationId), refetchInterval: 30_000 });

export const useVisitors = (locationId: string, params: { date?: string; status?: string }, enabled = true) =>
  useQuery({ ...qd.visitors(locationId, params), enabled });

/** Bookings starting from one date to another, both included. */
export const useBookingsRange = (locationId: string, from: string, to: string) =>
  useQuery(qd.bookingsRange(locationId, from, to));

export const useHolidays = (locationId: string, from?: string, to?: string) =>
  useQuery(qd.holidays(locationId, from, to));

export const useAnnouncements = (locationId: string) =>
  useQuery(qd.announcements(locationId));

/** How busy each space has been over the last so many days. */
export const useOccupancy = (locationId: string, days: number, enabled = true) =>
  useQuery({ ...qd.occupancy(locationId, days), enabled, staleTime: 60_000 });

/** The shifts of a location, for the booking form and for the page that manages them. With a member id, only the ones that member can use. */
export const useShifts = (locationId: string, memberId?: string, enabled = true) =>
  useQuery({ ...qd.shifts(locationId, memberId), enabled });

/** The amenities a location offers (tea, coffee, food), for setup, the member forms and the front desk. */
export const useAmenities = (locationId: string, enabled = true) =>
  useQuery({ ...qd.amenities(locationId), enabled });

/** Members still in the building after their shift or booking ended. Checked every half minute so the front desk sees it soon. */
export const useOverstaying = (locationId: string, enabled = true) =>
  useQuery({ queryKey: ['overstaying', locationId], queryFn: () => api.get<Overstay[]>('/attendance/overstaying', { locationId }), enabled, refetchInterval: 30_000 });

/** Members' requests for their free amenities that the front desk has not answered yet. */
export const useAmenityRequests = (locationId: string, enabled = true) =>
  useQuery({ queryKey: ['amenity-requests', locationId], queryFn: () => api.get<AmenityRequest[]>('/amenities/requests', { locationId, pending: 1 }), enabled, refetchInterval: 20_000 });

export const usePlans = (locationId: string) =>
  useQuery(qd.plans(locationId));

/**
 * Every cached query that shows money: the finance reports, the dashboard's month figures, invoices and payments,
 * expenses, member balances and money records, contracts and their deposits, the member portal summary, and
 * bookings (an invoice or a void changes whether a booking is billed). Every action that moves money refreshes all of them,
 * so no screen is left showing an old figure.
 */
export const FINANCE_KEYS = ['reports', 'dashboard', 'invoices', 'invoice', 'payments', 'expenses', 'members', 'member', 'contracts', 'summary', 'bookings'];

/** Invalidate every cached query whose first key segment is listed. */
export function useRefresh() {
  const qc = useQueryClient();
  return (...keys: string[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [k] })));
}
