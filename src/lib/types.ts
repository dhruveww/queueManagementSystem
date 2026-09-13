/**
 * Baari domain types.
 *
 * These mirror the SQL in supabase/migrations exactly and are the shared
 * contract between the list dashboard, the 3D floor view, and the analytics
 * suite. Change the SQL and this file together.
 */

export type PlanTier = "basic" | "pro";
export type StaffRole = "owner" | "manager" | "host" | "superadmin";
export type TableShape = "round" | "square" | "rect" | "booth";
export type TableStatus = "free" | "occupied" | "clearing" | "reserved" | "blocked";
export type ZoneKind = "indoor" | "outdoor" | "ac" | "rooftop" | "bar" | "private";
export type QueueStatus =
  | "waiting" | "notified" | "checked_in" | "seated"
  | "no_show" | "left" | "cancelled";
export type WaitMethod = "rolling_average" | "live_availability";
export type NotifTemplate =
  | "queue_confirmation" | "position_update" | "table_ready"
  | "grace_nudge" | "queue_left" | "feedback_request";
export type NotifStatus = "queued" | "sent" | "delivered" | "read" | "failed";
export type SubStatus = "trialing" | "active" | "past_due" | "halted" | "cancelled";

export interface Organization {
  id: string;
  name: string;
  gstin: string | null;
  created_at: string;
}

export interface Subscription {
  id: string;
  org_id: string;
  plan: PlanTier;
  status: SubStatus;
  razorpay_subscription_id: string | null;
  razorpay_customer_id: string | null;
  outlet_quota: number;
  current_period_end: string | null;
  trial_ends_at: string | null;
}

export interface Outlet {
  id: string;
  org_id: string;
  slug: string;
  name: string;
  address: string | null;
  timezone: string;
  phone: string | null;
  is_open: boolean;
  grace_period_min: number;
  grace_reoffers: number;
  notify_lead_min: number;
  max_party_size: number;
  pii_retention_days: number;
  feedback_url: string | null;
}

export interface Floor {
  id: string;
  outlet_id: string;
  name: string;
  level: number;
}

export interface Zone {
  id: string;
  outlet_id: string;
  floor_id: string;
  name: string;
  kind: ZoneKind;
  color: string;
}

/** A physical table. pos_x/pos_z are metres in floor-local space, rot_y radians. */
export interface RestaurantTable {
  id: string;
  outlet_id: string;
  floor_id: string;
  zone_id: string;
  label: string;
  shape: TableShape;
  capacity: number;
  pos_x: number;
  pos_z: number;
  rot_y: number;
  width: number;
  depth: number;
  status: TableStatus;
  merged_group_id: string | null;
  sort_index: number;
}

export interface TableGroup {
  id: string;
  outlet_id: string;
  floor_id: string;
  label: string;
  capacity: number;
  status: TableStatus;
}

export interface QueueEntry {
  id: string;
  outlet_id: string;
  ticket_code: string;
  guest_name: string;
  phone_e164: string | null;
  party_size: number;
  zone_pref: ZoneKind | null;
  notes: string | null;
  status: QueueStatus;
  joined_at: string;
  notified_at: string | null;
  checked_in_at: string | null;
  seated_at: string | null;
  closed_at: string | null;
  grace_expires_at: string | null;
  grace_used: number;
  assigned_table_id: string | null;
  assigned_group_id: string | null;
  est_wait_low_min: number | null;
  est_wait_high_min: number | null;
  est_method: WaitMethod | null;
  priority: number;
  source: string;
  notify_failed: boolean;
}

export interface NotificationLog {
  id: string;
  outlet_id: string;
  queue_entry_id: string | null;
  template: NotifTemplate;
  provider: string;
  provider_message_id: string | null;
  status: NotifStatus;
  error: string | null;
  sent_at: string;
  delivered_at: string | null;
  read_at: string | null;
}

// ------------------------------------------------------------------- leads
// Prospects from the marketing site, not tenants — no outlet_id, and not in
// the RLS do $$ loop. See migration 0007.

export type LeadStatus =
  | "new" | "proposed" | "approved" | "rescheduling" | "declined" | "expired";

/** What the owner can do from the buttons in their notification email. */
export type LeadAction = "approve" | "reschedule" | "decline" | "repick";

export interface Lead {
  id: string;
  contact_name: string;
  restaurant_name: string;
  city: string;
  phone_e164: string;
  email: string;
  outlets_count: number;
  requests: string | null;
  pricing_note: string | null;
  status: LeadStatus;
  slot_start: string | null;
  slot_end: string | null;
  timezone: string;
  gcal_event_id: string | null;
  meet_url: string | null;
  reschedule_count: number;
  proposed_slots: string[] | null;
  action_nonce: string;
  actioned_at: string | null;
  owner_note: string | null;
  reminder_sent_at: string | null;
  source: string;
  ip_hash: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadEvent {
  id: number;
  lead_id: string;
  kind: string;
  ok: boolean;
  detail: string | null;
  created_at: string;
}

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New",
  proposed: "Awaiting your call",
  approved: "Confirmed",
  rescheduling: "Rescheduling",
  declined: "Declined",
  expired: "Expired",
};

export interface StaffUser {
  id: string;
  org_id: string | null;
  full_name: string | null;
  email: string | null;
  role: StaffRole;
}

export interface AnalyticsDaily {
  outlet_id: string;
  day: string;
  joined: number;
  notified: number;
  checked_in: number;
  seated: number;
  no_show: number;
  left_queue: number;
  avg_wait_min: number | null;
  median_wait_min: number | null;
  avg_turn_min: number | null;
  est_error_min: number | null;
  returning_guests: number;
  new_guests: number;
  hourly: Record<string, HourlyBucket>;
}

export interface HourlyBucket {
  joined: number;
  seated: number;
  abandoned: number;
  avg_wait: number;
}

/** Everything the 3D floor view needs for one outlet, fetched in one round trip. */
export interface FloorPlanData {
  outlet: Outlet;
  floors: Floor[];
  zones: Zone[];
  tables: RestaurantTable[];
  groups: TableGroup[];
  /** Turnover rate per zone id, 0..1 normalised, drives the heatmap overlay. */
  zoneHeat: Record<string, number>;
}

export const TABLE_STATUS_COLOR: Record<TableStatus, string> = {
  free: "#22c55e",
  occupied: "#ef4444",
  clearing: "#f59e0b",
  reserved: "#3b82f6",
  blocked: "#6b7280",
};

export const TABLE_STATUS_LABEL: Record<TableStatus, string> = {
  free: "Free",
  occupied: "Occupied",
  clearing: "Being cleared",
  reserved: "Reserved",
  blocked: "Blocked",
};

export const QUEUE_STATUS_LABEL: Record<QueueStatus, string> = {
  waiting: "Waiting",
  notified: "Notified",
  checked_in: "Checked in",
  seated: "Seated",
  no_show: "No-show",
  left: "Left",
  cancelled: "Cancelled",
};

export const ZONE_KIND_LABEL: Record<ZoneKind, string> = {
  indoor: "Indoor",
  outdoor: "Outdoor",
  ac: "AC",
  rooftop: "Rooftop",
  bar: "Bar",
  private: "Private dining",
};

/** A queue entry is still in play (occupying a place in line). */
export const OPEN_QUEUE_STATUSES: QueueStatus[] = ["waiting", "notified", "checked_in"];
