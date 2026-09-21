CREATE TABLE collector_consumer_cursors (
  channel_id text NOT NULL REFERENCES channels(id),
  consumer_id text NOT NULL,
  collector_channel_id text NOT NULL,
  journal_generation text NOT NULL CHECK (length(journal_generation) BETWEEN 1 AND 200),
  channel_offset numeric(20,0) NOT NULL CHECK (channel_offset >= 0 AND channel_offset <= 18446744073709551615),
  recovery_revision numeric(20,0) NOT NULL CHECK (recovery_revision >= 0 AND recovery_revision <= 18446744073709551615),
  chat_stream_generation text,
  chat_stream_id text,
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  PRIMARY KEY(channel_id,consumer_id),
  UNIQUE(consumer_id,collector_channel_id)
);
ALTER TABLE donation_events ALTER COLUMN amount TYPE bigint;
ALTER TABLE donation_events DROP CONSTRAINT donation_events_result_check;
ALTER TABLE donation_events ADD CONSTRAINT donation_events_result_check CHECK (result IN ('matched','no_match','failed','pending','held','ignored'));

CREATE TABLE collector_donation_inbox (
  id uuid PRIMARY KEY,
  channel_id text NOT NULL REFERENCES channels(id),
  consumer_id text NOT NULL,
  collector_channel_id text NOT NULL,
  external_event_id text NOT NULL,
  journal_generation text NOT NULL,
  channel_offset numeric(20,0) NOT NULL,
  recovery_revision numeric(20,0) NOT NULL,
  payload jsonb NOT NULL,
  payload_hash text NOT NULL,
  rules_version_id uuid REFERENCES channel_config_versions(id),
  rules_snapshot jsonb,
  bound_session_id uuid REFERENCES game_sessions(id),
  disposition text NOT NULL CHECK (disposition IN ('pending','held','ignored','executed','failed')),
  reason text NOT NULL,
  execution_command_id uuid UNIQUE,
  action_progress integer NOT NULL DEFAULT 0 CHECK (action_progress >= 0),
  not_before timestamptz(3) NOT NULL DEFAULT now(),
  received_at timestamptz(3) NOT NULL DEFAULT now(),
  processed_at timestamptz(3),
  UNIQUE(consumer_id,collector_channel_id,external_event_id),
  UNIQUE(consumer_id,collector_channel_id,journal_generation,channel_offset)
);
CREATE INDEX collector_donation_pending ON collector_donation_inbox(channel_id,not_before,received_at,id) WHERE disposition='pending';
CREATE TABLE collector_dispatch_state (channel_id text PRIMARY KEY REFERENCES channels(id), next_movement_at timestamptz(3) NOT NULL DEFAULT now(), updated_at timestamptz(3) NOT NULL DEFAULT now());

CREATE TABLE collector_chat_inbox (
  id uuid PRIMARY KEY,
  channel_id text NOT NULL REFERENCES channels(id),
  consumer_id text NOT NULL,
  collector_channel_id text NOT NULL,
  external_event_id text NOT NULL,
  stream_generation text NOT NULL,
  stream_id text NOT NULL,
  gap_before boolean NOT NULL,
  payload jsonb NOT NULL,
  matched_task_id uuid REFERENCES session_effect_tasks(id),
  received_at timestamptz(3) NOT NULL DEFAULT now(),
  UNIQUE(consumer_id,collector_channel_id,external_event_id)
);
ALTER TABLE session_effect_tasks DROP CONSTRAINT session_effect_tasks_task_type_check;
ALTER TABLE session_effect_tasks ADD CONSTRAINT session_effect_tasks_task_type_check CHECK (task_type IN ('choice_mission','choose_destination','donation_destination'));
ALTER TABLE session_effect_tasks ADD COLUMN donation_inbox_id uuid UNIQUE REFERENCES collector_donation_inbox(id);

ALTER TABLE game_commands ALTER COLUMN operator_id DROP NOT NULL;
ALTER TABLE game_commands ADD COLUMN source_kind text NOT NULL DEFAULT 'operator' CHECK (source_kind IN ('operator','donation'));
ALTER TABLE game_commands ADD COLUMN donation_inbox_id uuid REFERENCES collector_donation_inbox(id);
ALTER TABLE game_commands ADD CONSTRAINT game_command_source CHECK (
  (source_kind='operator' AND operator_id IS NOT NULL AND donation_inbox_id IS NULL) OR
  (source_kind='donation' AND operator_id IS NULL AND donation_inbox_id IS NOT NULL)
);
ALTER TABLE operation_ledger ALTER COLUMN operator_id DROP NOT NULL;
ALTER TABLE operation_ledger ADD COLUMN source_kind text NOT NULL DEFAULT 'operator' CHECK (source_kind IN ('operator','donation'));
ALTER TABLE operation_ledger ADD COLUMN donation_inbox_id uuid REFERENCES collector_donation_inbox(id);
ALTER TABLE operation_ledger ADD CONSTRAINT operation_source CHECK (
  (source_kind='operator' AND operator_id IS NOT NULL AND donation_inbox_id IS NULL) OR
  (source_kind='donation' AND operator_id IS NULL AND donation_inbox_id IS NOT NULL)
);
ALTER TABLE inventory_ledger ALTER COLUMN operator_id DROP NOT NULL;
ALTER TABLE inventory_ledger ADD COLUMN source_kind text NOT NULL DEFAULT 'operator' CHECK (source_kind IN ('operator','donation'));
ALTER TABLE inventory_ledger ADD COLUMN donation_inbox_id uuid REFERENCES collector_donation_inbox(id);
ALTER TABLE inventory_ledger ADD CONSTRAINT inventory_ledger_source CHECK (
  (source_kind='operator' AND operator_id IS NOT NULL AND donation_inbox_id IS NULL) OR
  (source_kind='donation' AND operator_id IS NULL AND donation_inbox_id IS NOT NULL)
);
