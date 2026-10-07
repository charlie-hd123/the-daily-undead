const providers = new Set(["clerk", "supabase"]);

export function createAccountId(randomUUID = crypto.randomUUID.bind(crypto)) {
  return `acct_${randomUUID().replaceAll("-", "")}`;
}

export function normalizeAuthIdentity(identity) {
  if (
    !identity ||
    !providers.has(identity.provider) ||
    typeof identity.subject !== "string" ||
    identity.subject.length < 3 ||
    identity.subject.length > 200
  ) return null;
  return { provider: identity.provider, subject: identity.subject };
}

export async function resolveAccountIdentity(db, identity) {
  const normalized = normalizeAuthIdentity(identity);
  if (!normalized) return null;

  let row = await db.prepare(
    `SELECT profiles.user_id, profiles.account_id
    FROM account_identities AS identities
    INNER JOIN player_profiles AS profiles ON profiles.account_id = identities.account_id
    WHERE identities.provider = ? AND identities.provider_subject = ?`,
  ).bind(normalized.provider, normalized.subject).first();

  if (
    !row
    && normalized.provider === "supabase"
    && typeof identity.migrationSubject === "string"
    && identity.migrationSubject.startsWith("user_")
  ) {
    const legacy = await db.prepare(
      `SELECT account_id
      FROM account_identities
      WHERE provider = 'clerk' AND provider_subject = ?`,
    ).bind(identity.migrationSubject).first();
    if (legacy?.account_id) {
      await db.prepare(
        `INSERT INTO account_identities (provider, provider_subject, account_id)
        VALUES ('supabase', ?, ?)
        ON CONFLICT DO NOTHING`,
      ).bind(normalized.subject, legacy.account_id).run();
      row = await db.prepare(
        `SELECT profiles.user_id, profiles.account_id
        FROM account_identities AS identities
        INNER JOIN player_profiles AS profiles ON profiles.account_id = identities.account_id
        WHERE identities.provider = 'supabase' AND identities.provider_subject = ?`,
      ).bind(normalized.subject).first();
    }
  }

  return row
    ? {
        ...normalized,
        userId: row.user_id,
        accountId: row.account_id,
      }
    : {
        ...normalized,
        userId: null,
        accountId: null,
      };
}
