CREATE TABLE admin_sessions (
  id_hash text PRIMARY KEY,
  operator_id uuid NOT NULL REFERENCES operators(id),
  csrf_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_login_attempts (
  identity_hash text PRIMARY KEY,
  failed_count integer NOT NULL DEFAULT 0,
  blocked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_audit_log (
  id uuid PRIMARY KEY,
  admin_operator_id uuid NOT NULL REFERENCES operators(id),
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX admin_audit_log_created_idx ON admin_audit_log(created_at DESC, id DESC);
