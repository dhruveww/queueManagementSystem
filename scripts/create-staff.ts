/**
 * Creates a staff login and links it to an organization.
 *
 *   npm run staff -- you@example.com                 # owner of the demo org
 *   npm run staff -- you@example.com host            # host instead of owner
 *   npm run staff -- you@example.com owner 'secret'  # choose the password
 *
 * A Supabase Auth user on its own can't sign in to Baari — `staff_users` is
 * what maps them to an org and a role, and every RLS policy resolves through
 * it. This does both halves in one step.
 */

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.");
  process.exit(1);
}

const [email, role = "owner", passwordArg] = process.argv.slice(2);
if (!email) {
  console.error("Usage: npm run staff -- <email> [owner|manager|host|superadmin] [password]");
  process.exit(1);
}
if (!["owner", "manager", "host", "superadmin"].includes(role)) {
  console.error(`Unknown role "${role}". Use owner, manager, host or superadmin.`);
  process.exit(1);
}

const password = passwordArg ?? randomBytes(9).toString("base64url");
const db = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  const { data: orgs } = await db.from("organizations")
    .select("id, name").order("created_at", { ascending: false }).limit(1);
  const org = orgs?.[0];
  if (!org) throw new Error("No organization found — run `npm run seed` first.");

  // Reuse the auth user if this email already exists, so the script is safe to
  // re-run (and can be used to repair a login that was never linked).
  const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 });
  const existing = list?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

  let userId: string;
  if (existing) {
    userId = existing.id;
    await db.auth.admin.updateUserById(userId, { password });
    console.log(`Reused existing auth user, password reset.`);
  } else {
    const { data: created, error } = await db.auth.admin.createUser({
      email, password, email_confirm: true,
    });
    if (error || !created.user) throw new Error(`could not create auth user: ${error?.message}`);
    userId = created.user.id;
  }

  const { error: linkErr } = await db.from("staff_users").upsert({
    id: userId,
    org_id: org.id,
    full_name: email.split("@")[0],
    email,
    role,
  });
  if (linkErr) throw new Error(`could not link staff user: ${linkErr.message}`);

  console.log(`\nStaff login ready for ${org.name}`);
  console.log(`  email:    ${email}`);
  console.log(`  password: ${password}`);
  console.log(`  role:     ${role}`);
  console.log(`\nSign in at http://localhost:3000/login`);
}

main().catch((err) => { console.error(err.message ?? err); process.exit(1); });
