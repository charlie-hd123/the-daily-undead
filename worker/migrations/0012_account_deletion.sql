-- Retain only provider IDs needed to reject already-issued tokens after deletion.
-- No email, username, profile or gameplay data is retained here.
CREATE TABLE revoked_account_identities (
  provider TEXT NOT NULL,
  provider_subject TEXT NOT NULL,
  PRIMARY KEY (provider, provider_subject)
);

-- Durable retry queue: remove the auth user even if its service is unavailable.
CREATE TABLE account_deletion_jobs (
  provider_subject TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER reject_revoked_account_identity
BEFORE INSERT ON account_identities
WHEN EXISTS (
  SELECT 1 FROM revoked_account_identities
  WHERE provider = NEW.provider AND provider_subject = NEW.provider_subject
)
BEGIN
  SELECT RAISE(ABORT, 'This account has been deleted.');
END;
