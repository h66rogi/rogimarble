ALTER TABLE channel_pawn_appearances
  ADD COLUMN style_id text NOT NULL DEFAULT 'star-medal'
  CHECK (style_id IN ('star-medal','heart-chip','bunny-face'));

ALTER TABLE pawn_asset_audit
  DROP CONSTRAINT pawn_asset_audit_action_check,
  ADD CONSTRAINT pawn_asset_audit_action_check
    CHECK (action IN ('uploaded','deleted','style_selected')),
  ADD COLUMN style_id text
    CHECK (style_id IS NULL OR style_id IN ('star-medal','heart-chip','bunny-face'));
