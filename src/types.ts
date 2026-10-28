export type Role = 'superadmin' | 'owner' | 'manager' | 'staff' | 'member';
export type FeatureKey = 'visitors' | 'member_portal' | 'floor_3d' | 'plan_import' | 'invoicing' | 'expenses' | 'reports' | 'team';
export type PermissionKey = 'front_desk' | 'bookings' | 'members' | 'spaces' | 'plans' | 'holidays' | 'contracts' | 'announcements' | 'maintenance' | 'invoices' | 'billing_admin' | 'expenses' | 'reports';
export type OrgStatus = 'trial' | 'active' | 'suspended' | 'cancelled';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** What this person may do. Owners have all of it. */
  permissions: PermissionKey[];
  memberId: string | null;
}

export interface PermissionDef {
  key: PermissionKey;
  group: string;
  label: string;
  description: string;
}

export interface Location {
  id: string;
  name: string;
  code: string;
  address: string;
  timezone: string;
  currency: string;
  openTime: string;
  closeTime: string;
  taxRateBps: number;
  /** Weekdays the location is shut, like "0,6" (0 is Sunday). */
  closedWeekdays: string;
  active: boolean;
}

export type MemberStatus = 'lead' | 'active' | 'paused' | 'cancelled';
export type ResourceKind = 'room' | 'corporate_room' | 'hot_desk' | 'dedicated_desk' | 'office' | 'storage';
export type FloorObjectType =
  | 'kitchen'
  | 'coffee_machine'
  | 'lounge'
  | 'print_station'
  | 'reception'
  | 'plant'
  | 'core'
  | 'pantry'
  | 'water_dispenser'
  | 'vending_machine'
  | 'recreation'
  | 'nap_pod'
  | 'phone_corner'
  | 'library'
  | 'washroom_men'
  | 'washroom_women'
  | 'washroom_accessible'
  | 'prayer_room'
  | 'server_room'
  | 'storage_room'
  | 'mail_room'
  | 'generator_room'
  | 'security_desk'
  | 'fire_exit'
  | 'extinguisher'
  | 'first_aid'
  | 'terrace'
  | 'bike_rack'
  | 'wall'
  | 'glass_wall'
  | 'door'
  | 'window'
  | 'column'
  | 'zone'
  | 'label';

/** A variant of an object (an L-shaped zone, a double door) and the colour wash of a zone. Empty is the plain one. */
export type ObjectVariant = '' | 'l' | 'double' | 'sliding';
export type ObjectTint = '' | 'blue' | 'green' | 'yellow' | 'rose' | 'slate';
export type ResourceStatus = 'available' | 'maintenance' | 'cleaning' | 'reserved' | 'retired';
export type BookingStatus = 'confirmed' | 'completed' | 'cancelled' | 'no_show';
export type VisitorStatus = 'expected' | 'checked_in' | 'checked_out' | 'cancelled';
export type InvoiceStatus = 'open' | 'paid' | 'void';
export type PaymentMethod = 'cash' | 'card' | 'bank_transfer' | 'jazzcash' | 'easypaisa' | 'cheque' | 'other';

export interface Plan {
  id: string;
  locationId: string;
  name: string;
  description: string;
  interval: 'month' | 'day';
  priceCents: number;
  includedMeetingMinutes: number;
  includesHotDesk: boolean;
  active: boolean;
}

export interface MemberRow {
  id: string;
  userId: string;
  locationId: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  planId: string | null;
  planName: string | null;
  status: MemberStatus;
  startDate: string;
  endDate: string | null;
  notes: string;
  checkedIn: boolean;
}

export interface Assignment {
  id: string;
  resourceId: string;
  memberId: string;
  startDate: string;
  endDate: string | null;
  resourceName: string;
  resourceKind: ResourceKind;
  active: boolean;
}

export interface MemberDetail extends Omit<MemberRow, 'planName' | 'checkedIn'> {
  plan: Plan | null;
  assignments: Assignment[];
  balanceDueCents: number;
  overdueCents: number;
}

/** A kitchen, coffee machine or the like: on a floor plan, but not a space anyone books. */
export interface FloorObject {
  id: string;
  locationId: string;
  floor: string;
  type: FloorObjectType;
  label: string;
  x: number;
  z: number;
  w: number | null;
  d: number | null;
  rot: number;
  variant: ObjectVariant;
  tint: ObjectTint;
}

export interface Resource {
  id: string;
  locationId: string;
  kind: ResourceKind;
  name: string;
  floor: string;
  capacity: number;
  hourlyRateCents: number;
  dailyRateCents: number;
  amenities: string;
  status: ResourceStatus;
  notes: string;
  /** The look of it in the floor plan; empty means the default for its kind. */
  style: string;
  /** Where it sits in the floor plan, in metres. Null until it has been placed. */
  planX: number | null;
  planZ: number | null;
  planW: number | null;
  planD: number | null;
  /** Quarter turns, 0 to 3. */
  planRot: number;
  /** What members read before booking. */
  description: string;
  /** Opening hours of this space when they differ from the location's. */
  openTime: string | null;
  closeTime: string | null;
  /** Weekdays it is shut on top of the location's, like "0,6". */
  closedWeekdays: string | null;
  offPeakRateCents: number | null;
  peakStart: string | null;
  peakEnd: string | null;
  halfDayRateCents: number | null;
  fullDayRateCents: number | null;
  noPlanRateCents: number | null;
  /** The photos of it, in the order they were added. */
  photoIds?: string[];
  occupied?: boolean;
  occupant?: { assignmentId: string; memberId: string; name: string; company: string } | null;
}

export interface ScheduleBooking {
  id: string;
  resourceId: string;
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  allDay: boolean;
  mine: boolean;
  memberId?: string;
  memberName?: string;
}

/** A named time slot people can pick when booking, for one space, a kind of space, or any bookable space. */
export interface ShiftTemplate {
  id: string;
  locationId: string;
  name: string;
  resourceId: string | null;
  kind: ResourceKind | null;
  startTime: string;
  endTime: string;
  priceCents: number | null;
  active: boolean;
}

/** Where a booking's price came from. */
export type PriceBasis =
  | { type: 'plan' }
  | { type: 'minutes'; freeMinutes: number; billableMinutes: number }
  | { type: 'shift'; name: string }
  | { type: 'hourly'; rateCents: number }
  | { type: 'daily'; rateCents: number }
  | { type: 'dayshare'; rateCents: number }
  | { type: 'rates' };

export interface Schedule {
  date: string;
  timezone: string;
  /** Why the location is shut on this date, or null when it is open. */
  closed: string | null;
  openTime: string;
  closeTime: string;
  resources: Resource[];
  bookings: ScheduleBooking[];
  /** Desks a checked-in member is sitting at today (names are for staff only). */
  inUse: { resourceId: string; mine: boolean; memberName?: string }[];
}

export interface Booking {
  id: string;
  locationId: string;
  resourceId: string;
  memberId: string;
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  billableMinutes: number;
  priceCents: number;
  invoiceId: string | null;
  notes: string;
  /** When the member was checked in at the front desk for this booking. */
  checkedInAt: string | null;
  /** A hot desk booked from opening to closing; anything shorter is part of a day. */
  allDay: boolean;
  resourceName: string;
  resourceKind: ResourceKind;
  memberName: string;
}

export interface AttendanceRow {
  id: string;
  memberId: string;
  memberName: string;
  company: string;
  resourceName: string | null;
  checkInAt: string;
  checkOutAt: string | null;
}

export interface Visitor {
  id: string;
  hostMemberId: string;
  hostName: string;
  hostCompany: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  purpose: string;
  expectedAt: string;
  status: VisitorStatus;
  checkInAt: string | null;
  checkOutAt: string | null;
}

export interface InvoiceRow {
  id: string;
  number: string;
  memberId: string;
  memberName: string;
  company: string;
  kind: 'subscription' | 'manual';
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  overdue: boolean;
}

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
  bookingId: string | null;
}

export interface Payment {
  id: string;
  invoiceId: string;
  amountCents: number;
  method: PaymentMethod;
  paidAt: string;
  reference: string;
  notes: string;
}

export interface InvoiceDetail extends InvoiceRow {
  subtotalCents: number;
  taxCents: number;
  notes: string;
  memberEmail: string;
  currency: string;
  timezone: string;
  location: { name: string; address: string };
  items: InvoiceItem[];
  payments: Payment[];
}

export interface PaymentRow extends Payment {
  invoiceNumber: string;
  memberName: string;
}

export interface Expense {
  id: string;
  category: string;
  vendor: string;
  description: string;
  amountCents: number;
  incurredOn: string;
}

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  permissions: PermissionKey[];
  active: boolean;
  lastLoginAt: string | null;
  locationIds: string[];
  tempPassword?: string;
}

export interface Dashboard {
  today: string;
  currency: string;
  ops: {
    activeMembers: number;
    checkedInNow: number;
    visitorsExpectedToday: number;
    visitorsToday: number;
    visitorsInside: number;
    bookingsToday: number;
    rooms: { total: number; inUseNow: number };
    hotDesks: { total: number; bookedToday: number };
    dedicatedDesks: { total: number; assigned: number };
    offices: { total: number; assigned: number };
    storage: { total: number; assigned: number };
  };
  finance: {
    mrrCents: number;
    collectedThisMonthCents: number;
    invoicedThisMonthCents: number;
    expensesThisMonthCents: number;
    outstandingCents: number;
    overdueCents: number;
    overdueCount: number;
  } | null;
}

export interface FinanceReport {
  from: string;
  to: string;
  currency: string;
  totals: { invoicedCents: number; collectedCents: number; expensesCents: number; netCents: number };
  previous: { from: string; to: string; collectedCents: number; expensesCents: number; netCents: number };
  incomeByKind: { kind: IncomeKind; amountCents: number }[];
  profitLoss: {
    months: string[];
    income: { kind: IncomeKind; byMonth: number[]; totalCents: number }[];
    costs: { category: string; byMonth: number[]; totalCents: number }[];
  };
  monthly: { month: string; collectedCents: number; invoicedCents: number; expensesCents: number; netCents: number }[];
  expensesByCategory: { category: string; amountCents: number }[];
  paymentsByMethod: { method: string; amountCents: number }[];
  receivablesAging: Record<'current' | 'days1to30' | 'days31to60' | 'days61plus', { count: number; amountCents: number }>;
  deposits: { heldCents: number; receivedCents: number; refundedCents: number; keptCents: number; advanceCents: number; movements: DepositMovement[] };
}

export type IncomeKind = 'subscription' | 'manual' | 'kept_deposit' | 'advance';

export interface MemberSummary {
  member: { id: string; company: string; status: MemberStatus; locationId: string; locationName: string };
  currency: string;
  timezone: string;
  today: string;
  plan: Plan | null;
  meetingMinutes: { included: number; used: number };
  checkedIn: { id: string; checkInAt: string } | null;
  upcomingBookings: Booking[];
  openInvoices: InvoiceRow[];
  balanceDueCents: number;
  overdueCents: number;
  expectedVisitors: Visitor[];
}

/** The tenant a signed-in user belongs to: its package, features and subscription state. */
export interface OrgInfo {
  id: string;
  name: string;
  status: OrgStatus;
  packageName: string;
  features: FeatureKey[];
  maxLocations: number | null;
  maxMembers: number | null;
  periodEnd: string;
  expired: boolean;
}

// ---- Platform (super admin) ----

export interface FeatureDef {
  key: FeatureKey;
  label: string;
  description: string;
  requires?: FeatureKey[];
}

export interface PackageRow {
  id: string;
  name: string;
  description: string;
  interval: 'month' | 'year';
  priceCents: number;
  features: FeatureKey[];
  maxLocations: number | null;
  maxMembers: number | null;
  active: boolean;
  tenants: number;
}

export interface OrgUsage {
  locations: number;
  members: number;
  activeMembers: number;
  staff: number;
}

export interface OrgSummary {
  id: string;
  name: string;
  city: string;
  status: OrgStatus;
  expired: boolean;
  periodEnd: string;
  package: { id: string; name: string; priceCents: number; interval: 'month' | 'year' };
  usage: OrgUsage;
  owner: { name: string; email: string; lastLoginAt: string | null } | null;
  createdAt: string;
}

export interface PlatformPayment {
  id: string;
  organizationId: string;
  organizationName?: string;
  packageName?: string;
  amountCents: number;
  method: PaymentMethod;
  reference: string;
  notes: string;
  periodStart: string;
  periodEnd: string;
  paidAt: string;
}

export interface OrgDetail extends Omit<OrgSummary, 'package'> {
  contactEmail: string;
  phone: string;
  notes: string;
  package: PackageRow;
  owners: { id: string; name: string; email: string; phone: string; active: boolean; lastLoginAt: string | null }[];
  locations: { id: string; name: string; code: string; timezone: string; currency: string; address: string }[];
  payments: PlatformPayment[];
}

export interface PlatformOverview {
  today: string;
  currency: string;
  organizations: { total: number; trial: number; active: number; suspended: number; cancelled: number; expired: number };
  mrrCents: number;
  collectedThisMonthCents: number;
  people: { members: number; staff: number; locations: number };
  attention: { id: string; name: string; status: OrgStatus; periodEnd: string; daysLeft: number; package: string }[];
  byPackage: { id: string; name: string; tenants: number }[];
  recent: OrgSummary[];
}

/** A rectangle as fractions of an uploaded picture: x and y are its top left corner, measured from the picture's top left. */
export interface Frac {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What the server read from an uploaded floor plan. Everything is relative to the picture, so it can be rescaled freely. */
export interface PlanReading {
  outline: Frac;
  widthMetres: number;
  scaleBasis: 'stated' | 'estimated';
  rooms: { kind: ResourceKind; style: string; label: string; seats: number | null; box: Frac }[];
  deskBlocks: { style: string; rows: number; columns: number; rot: number; box: Frac; /** Where each desk was found, when they do not make a regular grid. */ members?: Frac[] }[];
  amenities: { type: FloorObjectType; label: string; box: Frac }[];
  notes: string[];
}

export interface Holiday {
  id: string;
  locationId: string;
  date: string;
  name: string;
}

export type ContractStatus = 'draft' | 'active' | 'ended' | 'cancelled';
export type DepositStatus = 'pending' | 'held' | 'refunded' | 'forfeited';

export interface Contract {
  id: string;
  locationId: string;
  memberId: string;
  memberName: string;
  company: string;
  resourceId: string | null;
  resourceName: string | null;
  startDate: string;
  endDate: string | null;
  rentCents: number;
  depositCents: number;
  depositStatus: DepositStatus;
  depositReturnedCents: number;
  advanceCents: number;
  advanceReceivedAt: string | null;
  status: ContractStatus;
  notes: string;
}

export interface DepositEntry {
  id: string;
  contractId: string;
  kind: 'received' | 'refunded' | 'kept' | 'advance';
  amountCents: number;
  method: PaymentMethod | null;
  reference: string;
  occurredAt: string;
}

export interface DepositMovement extends DepositEntry {
  memberName: string;
  resourceName: string | null;
}

export interface Announcement {
  id: string;
  locationId: string;
  title: string;
  body: string;
  draft: boolean;
  publishAt: string | null;
  state: 'draft' | 'scheduled' | 'live';
  createdAt: string;
}

export type IssuePriority = 'low' | 'normal' | 'urgent';
export type IssueStatus = 'open' | 'in_progress' | 'resolved';

export interface Issue {
  id: string;
  locationId: string;
  resourceId: string;
  resourceName: string;
  reporter: string;
  reportedById: string;
  title: string;
  description: string;
  priority: IssuePriority;
  status: IssueStatus;
  resolution: string;
  taskId: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export type TaskKind = 'cleaning' | 'maintenance' | 'inspection';

export interface SpaceTask {
  id: string;
  locationId: string;
  resourceId: string | null;
  resourceName: string | null;
  kind: TaskKind;
  title: string;
  notes: string;
  everyDays: number | null;
  nextDue: string;
  lastDoneAt: string | null;
  active: boolean;
  overdue: boolean;
}

export type AssetStatus = 'working' | 'needs_repair' | 'retired';

export interface SpaceAsset {
  id: string;
  locationId: string;
  resourceId: string | null;
  resourceName: string | null;
  name: string;
  category: string;
  serialNumber: string;
  purchasedOn: string | null;
  warrantyUntil: string | null;
  status: AssetStatus;
  notes: string;
}

export interface Occupancy {
  from: string;
  to: string;
  days: number;
  openDays: number;
  average: number;
  items: { resourceId: string; name: string; kind: ResourceKind; floor: string; utilization: number; used: number; unit: 'hours' | 'days' }[];
}

/** One thing in a saved arrangement, positioned relative to the arrangement's own corner. */
export type TemplateThing =
  | { type: 'resource'; kind: ResourceKind; style: string; name: string; capacity: number; hourlyRateCents: number; dailyRateCents: number; amenities: string; x: number; z: number; rot: number; w: number | null; d: number | null }
  | { type: 'object'; object: FloorObjectType; label: string; variant: ObjectVariant; tint: ObjectTint; x: number; z: number; rot: number; w: number | null; d: number | null };

export interface FloorTemplate {
  id: string;
  name: string;
  createdAt: string;
  things: TemplateThing[];
}
