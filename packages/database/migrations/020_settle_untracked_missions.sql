-- An announced mission no longer waits for an operator to mark its outcome.
-- Settle reservations already created by older board versions exactly once.
WITH pending AS (
  SELECT session_id, settlement_counter_id AS counter_id,
    SUM(settlement_amount)::integer AS amount
  FROM missions
  WHERE status = 'pending' AND settlement_on = 'mission_completion'
  GROUP BY session_id, settlement_counter_id
)
UPDATE session_counters AS counter
SET value = counter.value - pending.amount,
  revision = counter.revision + 1,
  updated_at = now()
FROM pending
WHERE counter.session_id = pending.session_id
  AND counter.counter_id = pending.counter_id;

UPDATE missions
SET settlement_on = 'creation'
WHERE status = 'pending' AND settlement_on = 'mission_completion';
