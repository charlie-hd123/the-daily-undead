ALTER TABLE player_profiles ADD COLUMN account_id TEXT;

UPDATE player_profiles
SET account_id = 'acct_' || lower(hex(randomblob(16)))
WHERE account_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS player_profiles_account_id_idx
  ON player_profiles (account_id);

CREATE TABLE IF NOT EXISTS account_identities (
  provider TEXT NOT NULL CHECK (provider IN ('clerk', 'supabase')),
  provider_subject TEXT NOT NULL,
  account_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (provider, provider_subject),
  UNIQUE (provider, account_id),
  FOREIGN KEY (account_id) REFERENCES player_profiles(account_id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO account_identities (provider, provider_subject, account_id)
SELECT 'clerk', user_id, account_id
FROM player_profiles
WHERE account_id IS NOT NULL;
