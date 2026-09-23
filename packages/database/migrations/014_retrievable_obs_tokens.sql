-- Existing hash-only tokens cannot be recovered. New tokens retain the value
-- so authenticated console users can inspect their OBS URLs after a reload.
ALTER TABLE obs_access_tokens ADD COLUMN token_value text;
