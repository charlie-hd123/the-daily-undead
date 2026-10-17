function syncKey(env) {
  return env.SUPABASE_SECRET_KEY || env.SUPABASE_HEARTBEAT_SECRET_KEY;
}

function syncEnabled(env) {
  // Local accounts share staging authentication but have independent usernames.
  return ["staging", "production"].includes(env.DEPLOYMENT_ENVIRONMENT)
    && Boolean(env.SUPABASE_ISSUER && syncKey(env));
}

export async function syncAuthProfile(env, subject, fetchImpl = fetch) {
  if (!syncEnabled(env)) return false;
  try {
    const profile = await env.DB.prepare(`
      SELECT profiles.account_id, profiles.username, sync.synced_username,
        sync.last_synced_at > datetime('now', '-1 day') AS fresh
      FROM account_identities AS identities
      JOIN player_profiles AS profiles ON profiles.account_id = identities.account_id
      LEFT JOIN auth_profile_sync AS sync ON sync.account_id = profiles.account_id
      WHERE identities.provider = 'supabase' AND identities.provider_subject = ?
    `).bind(subject).first();
    if (!profile || (profile.synced_username === profile.username && profile.fresh)) return true;

    await env.DB.prepare(`
      INSERT INTO auth_profile_sync (account_id, last_attempt_at)
      VALUES (?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ON CONFLICT(account_id) DO UPDATE SET last_attempt_at = excluded.last_attempt_at
    `).bind(profile.account_id).run();
    const response = await fetchImpl(`${env.SUPABASE_ISSUER.replace(/\/$/, "")}/admin/users/${encodeURIComponent(subject)}`, {
      method: "PUT",
      headers: { apikey: syncKey(env), Authorization: `Bearer ${syncKey(env)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ app_metadata: {
        daily_undead_username: profile.username,
        daily_undead_account_id: profile.account_id,
      } }),
      signal: AbortSignal.timeout(5_000),
    });
    await response.body?.cancel();
    if (!response.ok) return false;
    // Record the value actually sent, so a concurrent rename stays pending.
    await env.DB.prepare(`
      UPDATE auth_profile_sync SET synced_username = ?, last_synced_at = CURRENT_TIMESTAMP
      WHERE account_id = ?
    `).bind(profile.username, profile.account_id).run();
    return true;
  } catch {
    // A metadata outage must never fail a successful profile save.
    return false;
  }
}

export async function retryAuthProfileSync(env, fetchImpl = fetch) {
  if (!syncEnabled(env)) return;
  const pending = await env.DB.prepare(`
    SELECT identities.provider_subject
    FROM account_identities AS identities
    JOIN player_profiles AS profiles ON profiles.account_id = identities.account_id
    LEFT JOIN auth_profile_sync AS sync ON sync.account_id = profiles.account_id
    WHERE identities.provider = 'supabase'
      AND (sync.synced_username IS NULL OR sync.synced_username != profiles.username
        OR sync.last_synced_at <= datetime('now', '-1 day'))
    ORDER BY COALESCE(sync.last_attempt_at, ''), profiles.account_id
    LIMIT 20
  `).all();
  // Bound outbound requests and let new backfills pass accounts that fail.
  for (let index = 0; index < pending.results.length; index += 5) {
    await Promise.all(pending.results.slice(index, index + 5).map(
      (identity) => syncAuthProfile(env, identity.provider_subject, fetchImpl),
    ));
  }
}
