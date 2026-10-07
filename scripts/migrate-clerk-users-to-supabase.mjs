import { createClient } from "@supabase/supabase-js";

const applyChanges = process.argv.includes("--apply");
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!clerkSecretKey || !supabaseUrl || !supabaseSecretKey) {
  throw new Error("CLERK_SECRET_KEY, SUPABASE_URL and SUPABASE_SECRET_KEY are required.");
}

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

async function listClerkUsers() {
  const users = [];
  for (let offset = 0; ; offset += 500) {
    const url = new URL("https://api.clerk.com/v1/users");
    url.searchParams.set("limit", "500");
    url.searchParams.set("offset", String(offset));
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${clerkSecretKey}`, Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Clerk user export failed with HTTP ${response.status}.`);
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error("Clerk returned an invalid user list.");
    users.push(...page);
    if (page.length < 500) return users;
  }
}

async function listSupabaseUsers(client) {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1_000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1_000) return users;
  }
}

const supabase = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const [clerkUsers, supabaseUsers] = await Promise.all([
  listClerkUsers(),
  listSupabaseUsers(supabase),
]);

const supabaseByEmail = new Map();
for (const user of supabaseUsers) {
  const email = normalizeEmail(user.email);
  if (email) supabaseByEmail.set(email, user);
}

const candidates = [];
const skipped = [];
const clerkEmails = new Set();
for (const clerkUser of clerkUsers) {
  const primary = clerkUser.email_addresses?.find(
    (address) => address.id === clerkUser.primary_email_address_id,
  );
  const email = normalizeEmail(primary?.email_address);
  if (!email) {
    skipped.push(clerkUser.id);
    continue;
  }
  if (clerkEmails.has(email)) {
    throw new Error("Two Clerk users share a primary email. Resolve the duplicate before migration.");
  }
  clerkEmails.add(email);
  candidates.push({ clerkUserId: clerkUser.id, email, existing: supabaseByEmail.get(email) });
}

console.log(JSON.stringify({
  mode: applyChanges ? "apply" : "dry-run",
  clerkUsers: clerkUsers.length,
  eligible: candidates.length,
  existingSupabaseUsers: candidates.filter((item) => item.existing).length,
  newSupabaseUsers: candidates.filter((item) => !item.existing).length,
  skippedWithoutPrimaryEmail: skipped.length,
}, null, 2));

if (!applyChanges) {
  console.log("Dry run only. Re-run with --apply after reviewing the counts.");
  process.exit(0);
}

let created = 0;
let updated = 0;
for (const candidate of candidates) {
  const appMetadata = {
    ...(candidate.existing?.app_metadata || {}),
    daily_undead_clerk_user_id: candidate.clerkUserId,
  };
  if (candidate.existing) {
    const { error } = await supabase.auth.admin.updateUserById(candidate.existing.id, {
      app_metadata: appMetadata,
    });
    if (error) throw error;
    updated += 1;
  } else {
    const { error } = await supabase.auth.admin.createUser({
      email: candidate.email,
      email_confirm: true,
      app_metadata: appMetadata,
    });
    if (error) throw error;
    created += 1;
  }
}

console.log(JSON.stringify({ created, updated, skipped: skipped.length }, null, 2));
