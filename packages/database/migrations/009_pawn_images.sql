CREATE TABLE pawn_assets (
  id uuid PRIMARY KEY,
  channel_id text NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  mime_type text NOT NULL CHECK (mime_type IN ('image/png','image/jpeg','image/webp')),
  image_bytes bytea NOT NULL CHECK (octet_length(image_bytes) BETWEEN 1 AND 5242880),
  width integer NOT NULL CHECK (width BETWEEN 1 AND 2048),
  height integer NOT NULL CHECK (height BETWEEN 1 AND 2048),
  created_by uuid NOT NULL REFERENCES operators(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE pawn_assets ADD CONSTRAINT pawn_assets_channel_id_id_unique UNIQUE(channel_id,id);

CREATE TABLE channel_pawn_appearances (
  channel_id text PRIMARY KEY REFERENCES channels(id) ON DELETE CASCADE,
  asset_id uuid,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT channel_pawn_asset_scope FOREIGN KEY(channel_id,asset_id) REFERENCES pawn_assets(channel_id,id) ON DELETE SET NULL (asset_id)
);

CREATE TABLE pawn_asset_audit (
  id uuid PRIMARY KEY,
  channel_id text NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  actor_operator_id uuid NOT NULL REFERENCES operators(id),
  action text NOT NULL CHECK (action IN ('uploaded','deleted')),
  asset_id uuid,
  revision bigint NOT NULL CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pawn_asset_audit_channel ON pawn_asset_audit(channel_id,created_at DESC,id DESC);
