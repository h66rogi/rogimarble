CREATE TABLE channel_config_versions (
  id uuid PRIMARY KEY,
  channel_id text NOT NULL REFERENCES channels(id),
  kind text NOT NULL CHECK (kind IN ('rules','items','board','overlay-layout')),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  status text NOT NULL CHECK (status IN ('draft','validated','published','superseded')),
  document jsonb NOT NULL,
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid NOT NULL REFERENCES operators(id),
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  published_at timestamptz(3)
);
CREATE INDEX channel_config_versions_lookup ON channel_config_versions(channel_id,kind,status,created_at DESC);
CREATE UNIQUE INDEX channel_config_one_published ON channel_config_versions(channel_id,kind) WHERE status='published';

CREATE TABLE channel_config_audit (
  id uuid PRIMARY KEY,
  channel_id text NOT NULL REFERENCES channels(id),
  version_id uuid REFERENCES channel_config_versions(id),
  kind text NOT NULL,
  action text NOT NULL,
  actor_operator_id uuid NOT NULL REFERENCES operators(id),
  before_document jsonb,
  after_document jsonb,
  created_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX channel_config_audit_feed ON channel_config_audit(channel_id,created_at DESC,id DESC);

CREATE TABLE donation_events (
  id uuid PRIMARY KEY,
  channel_id text NOT NULL REFERENCES channels(id),
  session_id uuid REFERENCES game_sessions(id),
  external_event_id text NOT NULL,
  donor_display_name text NOT NULL,
  amount integer NOT NULL CHECK (amount > 0),
  message text,
  rule_id text,
  result text NOT NULL CHECK (result IN ('matched','no_match','failed','pending')),
  result_detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz(3) NOT NULL,
  received_at timestamptz(3) NOT NULL DEFAULT now(),
  UNIQUE(channel_id,external_event_id)
);
CREATE INDEX donation_events_feed ON donation_events(channel_id,occurred_at DESC,id DESC);

CREATE TABLE obs_access_tokens (
  id uuid PRIMARY KEY,
  channel_id text NOT NULL REFERENCES channels(id),
  token_hash text NOT NULL UNIQUE,
  token_suffix text NOT NULL,
  label text NOT NULL,
  created_by uuid NOT NULL REFERENCES operators(id),
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  last_used_at timestamptz(3),
  revoked_at timestamptz(3)
);
CREATE INDEX obs_access_tokens_channel ON obs_access_tokens(channel_id,created_at DESC);
