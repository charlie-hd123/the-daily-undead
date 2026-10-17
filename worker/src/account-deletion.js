function deletionKey(env) {
  return env.SUPABASE_SECRET_KEY || env.SUPABASE_HEARTBEAT_SECRET_KEY;
}

export async function isAccountRevoked(db, identity) {
  return Boolean(await db.prepare(
    "SELECT 1 FROM revoked_account_identities WHERE provider = ? AND provider_subject = ?",
  ).bind(identity.provider, identity.subject).first());
}

export async function finishAuthDeletion(env, subject, fetchImpl = fetch) {
  if (env.DEPLOYMENT_ENVIRONMENT === "local" || !deletionKey(env)) return false;
  try {
    const response = await fetchImpl(`${env.SUPABASE_ISSUER}/admin/users/${encodeURIComponent(subject)}`, {
      method: "DELETE",
      headers: { apikey: deletionKey(env), Authorization: `Bearer ${deletionKey(env)}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok && response.status !== 404) return false;
    await env.DB.prepare("DELETE FROM account_deletion_jobs WHERE provider_subject = ?").bind(subject).run();
    return true;
  } catch {
    return false;
  }
}

export async function retryAuthDeletions(env) {
  const jobs = await env.DB.prepare(
    "SELECT provider_subject FROM account_deletion_jobs ORDER BY created_at LIMIT 20",
  ).all();
  await Promise.all(jobs.results.map((job) => finishAuthDeletion(env, job.provider_subject)));
}

export async function deleteAccount(request, env, identity, fetchImpl = fetch) {
  const payload = await request.json().catch(() => null);
  if (payload?.confirmation !== "DELETE") {
    return { status: 400, body: { error: "Type DELETE to confirm account deletion." } };
  }
  // Local D1 must never remove an identity from the shared staging auth project.
  if (env.DEPLOYMENT_ENVIRONMENT === "local") {
    return { status: 409, body: { error: "Use the staging website to test account deletion. Local development shares staging sign-in." } };
  }
  if (identity.provider !== "supabase" || !deletionKey(env)) {
    return { status: 503, body: { error: "Account deletion is temporarily unavailable. Please try again later." } };
  }

  const statements = [env.DB.prepare(
    "INSERT OR IGNORE INTO revoked_account_identities (provider, provider_subject) VALUES (?, ?)",
  ).bind(identity.provider, identity.subject)];
  if (identity.accountId) {
    statements.push(env.DB.prepare(
      `INSERT OR IGNORE INTO revoked_account_identities (provider, provider_subject)
       SELECT provider, provider_subject FROM account_identities WHERE account_id = ?`,
    ).bind(identity.accountId));
  }
  statements.push(env.DB.prepare(
    "INSERT OR IGNORE INTO account_deletion_jobs (provider_subject) VALUES (?)",
  ).bind(identity.subject));
  if (identity.userId) {
    // Foreign-key cascades remove saves, daily results and every linked identity.
    statements.push(env.DB.prepare("DELETE FROM player_profiles WHERE user_id = ?").bind(identity.userId));
  }
  await env.DB.batch(statements);
  const completed = await finishAuthDeletion(env, identity.subject, fetchImpl);
  return { status: completed ? 200 : 202, body: { deleted: true, authDeletionPending: !completed } };
}
