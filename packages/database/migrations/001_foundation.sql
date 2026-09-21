CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  checksum text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE operators (
  id uuid PRIMARY KEY,
  username text NOT NULL UNIQUE CHECK (username = lower(username)),
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'operator', 'viewer')),
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE channels (
  id text PRIMARY KEY,
  display_name text NOT NULL,
  owner_operator_id uuid NOT NULL REFERENCES operators(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE channel_operators (
  channel_id text NOT NULL REFERENCES channels(id),
  operator_id uuid NOT NULL REFERENCES operators(id),
  permission text NOT NULL CHECK (permission IN ('manage', 'operate', 'view')),
  PRIMARY KEY (channel_id, operator_id)
);

CREATE TABLE auth_sessions (
  id_hash text PRIMARY KEY,
  operator_id uuid NOT NULL REFERENCES operators(id),
  csrf_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE login_attempts (
  identity_hash text PRIMARY KEY,
  failed_count integer NOT NULL DEFAULT 0,
  blocked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE board_versions (
  id uuid PRIMARY KEY,
  channel_id text NOT NULL REFERENCES channels(id),
  board_definition jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('draft', 'validated')),
  supported_for_live boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES operators(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE game_sessions (
  id uuid PRIMARY KEY,
  channel_id text NOT NULL REFERENCES channels(id),
  board_version_id uuid NOT NULL REFERENCES board_versions(id),
  status text NOT NULL CHECK (status IN ('ready', 'running', 'paused', 'ended')),
  session_epoch integer NOT NULL DEFAULT 1 CHECK (session_epoch > 0),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  current_cell_id text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('forward', 'reverse')),
  automatic_movement_paused boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_open_session_per_channel ON game_sessions(channel_id)
  WHERE status <> 'ended';

CREATE TABLE game_commands (
  command_id uuid PRIMARY KEY,
  channel_id text NOT NULL REFERENCES channels(id),
  session_id uuid NOT NULL REFERENCES game_sessions(id),
  operator_id uuid NOT NULL REFERENCES operators(id),
  type text NOT NULL CHECK (type IN ('create_session', 'roll_dice', 'set_direction', 'set_position')),
  request_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('completed', 'rejected')),
  before_revision bigint NOT NULL,
  after_revision bigint NOT NULL,
  result jsonb,
  rejection_code text,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE operation_ledger (
  id uuid PRIMARY KEY,
  command_id uuid NOT NULL REFERENCES game_commands(command_id),
  channel_id text NOT NULL REFERENCES channels(id),
  session_id uuid NOT NULL REFERENCES game_sessions(id),
  operator_id uuid NOT NULL REFERENCES operators(id),
  operation_type text NOT NULL,
  before_state jsonb NOT NULL,
  after_state jsonb NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE game_outbox (
  id uuid PRIMARY KEY,
  aggregate_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
