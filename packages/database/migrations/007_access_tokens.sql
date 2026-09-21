CREATE TABLE operator_access_tokens (
  id uuid PRIMARY KEY,
  operator_id uuid NOT NULL REFERENCES operators(id),
  token_hash char(64) NOT NULL UNIQUE,
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 80),
  expires_at timestamptz NOT NULL,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);
CREATE INDEX operator_access_tokens_operator ON operator_access_tokens(operator_id,created_at DESC);

ALTER TABLE auth_sessions ADD COLUMN access_token_id uuid REFERENCES operator_access_tokens(id);
CREATE INDEX auth_sessions_access_token ON auth_sessions(access_token_id) WHERE access_token_id IS NOT NULL;
