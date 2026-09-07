/**
 * Seeds a demo tenant: one restaurant group, one outlet with three floors and
 * a real-ish table layout, plus 30 days of queue history so the analytics
 * dashboard has something to say on first load.
 *
 *   npx tsx scripts/seed.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const NAMES = [
  "Ananya", "Rohit", "Kavya", "Arjun", "Meera", "Vikram", "Priya", "Sanjay",
  "Divya", "Karthik", "Nisha", "Aditya", "Sneha", "Rahul", "Ishita", "Farhan",
  "Lakshmi", "Imran", "Tanvi", "Gaurav",
];

async function main() {
  console.log("Seeding Baari demo data…");

  const { data: org } = await db.from("organizations")
    .insert({ name: "Bengaluru Hospitality Co.", gstin: "29ABCDE1234F1Z5" })
    .select().single();
  if (!org) throw new Error("could not create organization");

  await db.from("subscriptions").insert({
    org_id: org.id, plan: "pro", status: "active",
    outlet_quota: 2, current_period_end: iso(days(30)),
  });

  const { data: outlet } = await db.from("outlets").insert({
    org_id: org.id,
    slug: "thindi-house-indiranagar",
    name: "Thindi House · Indiranagar",
    address: "100 Feet Road, Indiranagar, Bengaluru",
    phone: "+918041234567",
  }).select().single();
  if (!outlet) throw new Error("could not create outlet");

  // ---- floors, zones ----------------------------------------------------
  const floorSpecs = [
    { name: "Ground", level: 0 },
    { name: "First", level: 1 },
    { name: "Rooftop", level: 2 },
  ];
  const { data: floors } = await db.from("floors")
    .insert(floorSpecs.map((f) => ({ ...f, outlet_id: outlet.id })))
    .select();
  if (!floors) throw new Error("could not create floors");

  const zoneSpecs = [
    { floor: "Ground", name: "Main Hall", kind: "indoor", color: "#3987e5" },
    { floor: "Ground", name: "Window Side", kind: "indoor", color: "#199e70" },
    { floor: "First", name: "AC Dining", kind: "ac", color: "#9085e9" },
    { floor: "First", name: "Private Room", kind: "private", color: "#d55181" },
    { floor: "Rooftop", name: "Terrace", kind: "rooftop", color: "#d95926" },
  ];
  const { data: zones } = await db.from("zones").insert(
    zoneSpecs.map((z) => ({
      outlet_id: outlet.id,
      floor_id: floors.find((f) => f.name === z.floor)!.id,
      name: z.name, kind: z.kind, color: z.color,
    })),
  ).select();
  if (!zones) throw new Error("could not create zones");

  // ---- tables: a grid per zone, sized like a real room -------------------
  const tables: Record<string, unknown>[] = [];
  let n = 1;
  for (const zone of zones) {
    const count = zone.name === "Private Room" ? 2 : zone.name === "Terrace" ? 8 : 6;
    for (let i = 0; i < count; i++) {
      const capacity = zone.name === "Private Room" ? 10 : i % 4 === 0 ? 2 : i % 3 === 0 ? 6 : 4;
      const shape = capacity <= 2 ? "round" : capacity >= 6 ? "rect" : "square";
      tables.push({
        outlet_id: outlet.id,
        floor_id: zone.floor_id,
        zone_id: zone.id,
        label: `T${n}`,
        shape,
        capacity,
        pos_x: (i % 3) * 2.6 - 2.6 + (zones.indexOf(zone) % 2) * 0.4,
        pos_z: Math.floor(i / 3) * 2.6 - 1.3,
        rot_y: 0,
        width: shape === "rect" ? 1.8 : 1.1,
        depth: 1.1,
        sort_index: n,
      });
      n++;
    }
  }
  await db.from("restaurant_tables").insert(tables);
  console.log(`  ${tables.length} tables across ${floors.length} floors`);

  const { data: liveTables } = await db.from("restaurant_tables")
    .select("id, capacity, zone_id, floor_id").eq("outlet_id", outlet.id);
  if (!liveTables) throw new Error("could not read tables back");

  // ---- 30 days of history ----------------------------------------------
  const entries: Record<string, unknown>[] = [];
  const sessions: Record<string, unknown>[] = [];
  const phones = NAMES.map((_, i) => `+9198${String(76543210 + i).padStart(8, "0")}`);
  let ticket = 0;

  for (let d = 30; d >= 1; d--) {
    const date = days(-d);
    const dow = date.getDay();
    // Weekends are roughly twice as busy — that's what makes the peak heatmap
    // and the day-of-week comparison say anything at all.
    const volume = Math.round((dow === 0 || dow === 6 ? 46 : 22) * (0.8 + Math.random() * 0.4));

    for (let i = 0; i < volume; i++) {
      const hour = pickHour();
      const joined = new Date(date);
      joined.setHours(hour, Math.floor(Math.random() * 60), 0, 0);

      const partySize = pick([2, 2, 2, 3, 4, 4, 5, 6, 8]);
      const guest = Math.floor(Math.random() * NAMES.length);
      const estLow = 10 + Math.floor(Math.random() * 20);
      const actualWait = Math.max(2, estLow + Math.round((Math.random() - 0.4) * 22));

      // Longer waits abandon more often — the abandonment chart depends on it.
      const abandonChance = Math.min(0.55, actualWait / 110);
      const abandoned = Math.random() < abandonChance;
      const status = abandoned ? (Math.random() < 0.6 ? "left" : "no_show") : "seated";

      const notifiedAt = new Date(joined.getTime() + actualWait * 0.75 * 60_000);
      const endAt = new Date(joined.getTime() + actualWait * 60_000);
      const table = liveTables.find((t) => t.capacity >= partySize) ?? liveTables[0];

      ticket++;
      const id = crypto.randomUUID();
      entries.push({
        id,
        outlet_id: outlet.id,
        ticket_code: `${String.fromCharCode(65 + (ticket % 26))}${String(ticket % 100).padStart(2, "0")}`,
        guest_name: NAMES[guest],
        phone_e164: phones[guest],
        party_size: partySize,
        status,
        joined_at: iso(joined),
        notified_at: iso(notifiedAt),
        checked_in_at: status === "seated" ? iso(endAt) : null,
        seated_at: status === "seated" ? iso(endAt) : null,
        closed_at: status === "seated" ? null : iso(endAt),
        est_wait_low_min: estLow,
        est_wait_high_min: estLow + 10,
        est_method: "live_availability",
        assigned_table_id: status === "seated" ? table.id : null,
        source: Math.random() < 0.85 ? "qr" : "walkin",
      });

      if (status === "seated") {
        const turn = 30 + Math.round(Math.random() * 45);
        sessions.push({
          outlet_id: outlet.id,
          table_id: table.id,
          zone_id: table.zone_id,
          floor_id: table.floor_id,
          queue_entry_id: id,
          party_size: partySize,
          seated_at: iso(endAt),
          cleared_at: iso(new Date(endAt.getTime() + turn * 60_000)),
        });
      }
    }
  }

  await insertChunked("queue_entries", entries);
  await insertChunked("table_sessions", sessions);
  console.log(`  ${entries.length} queue entries, ${sessions.length} table sessions`);

  // ---- WhatsApp template registry --------------------------------------
  const templates = [
    "queue_confirmation", "position_update", "table_ready",
    "grace_nudge", "queue_left", "feedback_request",
  ];
  await db.from("whatsapp_templates").insert(
    templates.map((template) => ({
      org_id: org.id, template, provider_name: `baari_${template}`, approval: "approved",
    })),
  );

  // ---- roll up so analytics is populated immediately --------------------
  for (let d = 30; d >= 0; d--) {
    await db.rpc("rebuild_analytics_daily", {
      p_outlet: outlet.id,
      p_day: iso(days(-d)).slice(0, 10),
    });
  }

  console.log(`\nDone. Guest join page: /q/${outlet.slug}`);
  console.log("Create a staff login in Supabase Auth, then insert a staff_users row:");
  console.log(`  insert into staff_users (id, org_id, full_name, email, role)`);
  console.log(`  values ('<auth-user-uuid>', '${org.id}', 'Demo Manager', '<email>', 'owner');`);
}

async function insertChunked(table: string, rows: Record<string, unknown>[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from(table).insert(rows.slice(i, i + 500));
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

/** Dinner-heavy, with a lunch bump — an Indian casual-dining shape. */
function pickHour(): number {
  const r = Math.random();
  if (r < 0.28) return 12 + Math.floor(Math.random() * 3);  // 12–14
  if (r < 0.42) return 16 + Math.floor(Math.random() * 3);  // 16–18
  return 19 + Math.floor(Math.random() * 4);                // 19–22
}

function pick<T>(xs: T[]): T { return xs[Math.floor(Math.random() * xs.length)]; }
function days(n: number): Date { const d = new Date(); d.setDate(d.getDate() + n); return d; }
function iso(d: Date): string { return d.toISOString(); }

main().catch((err) => { console.error(err); process.exit(1); });
