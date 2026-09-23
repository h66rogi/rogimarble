-- Keep the most recently used active address for each channel. Older active
-- addresses are retired so a channel has exactly one valid overlay token.
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY channel_id
    ORDER BY last_used_at DESC NULLS LAST, created_at DESC, id DESC
  ) AS position
  FROM obs_access_tokens
  WHERE revoked_at IS NULL
)
UPDATE obs_access_tokens AS token
SET revoked_at = now(), token_value = NULL
FROM ranked
WHERE token.id = ranked.id AND ranked.position > 1;

CREATE UNIQUE INDEX obs_access_tokens_one_active_per_channel
  ON obs_access_tokens(channel_id) WHERE revoked_at IS NULL;
