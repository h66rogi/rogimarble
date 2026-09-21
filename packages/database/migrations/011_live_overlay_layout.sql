CREATE TABLE channel_live_overlay_layouts (
  channel_id text PRIMARY KEY REFERENCES channels(id),
  layout jsonb NOT NULL,
  revision bigint NOT NULL CHECK (revision > 0),
  published_version_id uuid REFERENCES channel_config_versions(id),
  updated_by uuid REFERENCES operators(id),
  updated_at timestamptz(3) NOT NULL DEFAULT now()
);

CREATE TABLE channel_live_overlay_layout_audit (
  id uuid PRIMARY KEY,
  channel_id text NOT NULL REFERENCES channels(id),
  revision bigint NOT NULL,
  action text NOT NULL CHECK (action IN ('live.updated','published.reset')),
  actor_operator_id uuid REFERENCES operators(id),
  before_layout jsonb,
  after_layout jsonb NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  UNIQUE(channel_id,revision)
);
CREATE INDEX channel_live_overlay_layout_audit_feed
  ON channel_live_overlay_layout_audit(channel_id,revision DESC);
