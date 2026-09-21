ALTER TABLE missions DROP CONSTRAINT IF EXISTS missions_created_by_command_id_key;
ALTER TABLE missions ADD COLUMN source_effect_index integer;
ALTER TABLE missions ADD COLUMN settlement_counter_id text;
ALTER TABLE missions ADD COLUMN settlement_amount integer CHECK (settlement_amount > 0);
ALTER TABLE missions ADD COLUMN settlement_on text CHECK (settlement_on IN ('creation','mission_completion'));
CREATE UNIQUE INDEX missions_command_effect ON missions(created_by_command_id,source_effect_index) WHERE source_effect_index IS NOT NULL;

ALTER TABLE inventory_ledger DROP CONSTRAINT IF EXISTS inventory_ledger_command_id_key;
ALTER TABLE inventory_ledger ADD COLUMN source_effect_index integer;
CREATE UNIQUE INDEX inventory_ledger_command_effect ON inventory_ledger(command_id,source_effect_index) WHERE source_effect_index IS NOT NULL;

CREATE TABLE session_counters (
  session_id uuid NOT NULL REFERENCES game_sessions(id),
  counter_id text NOT NULL,
  value integer NOT NULL CHECK (value >= 0),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  PRIMARY KEY(session_id,counter_id)
);

CREATE TABLE session_roll_modifiers (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES game_sessions(id),
  modifier_type text NOT NULL CHECK (modifier_type='movement_multiplier'),
  factor integer NOT NULL CHECK (factor > 0 AND factor <= 100),
  uses_remaining integer NOT NULL CHECK (uses_remaining > 0 AND uses_remaining <= 1000),
  source_command_id uuid NOT NULL REFERENCES game_commands(command_id),
  source_effect_index integer NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  UNIQUE(source_command_id,source_effect_index)
);
CREATE INDEX session_roll_modifiers_next ON session_roll_modifiers(session_id,created_at,id);
CREATE UNIQUE INDEX session_roll_modifier_type ON session_roll_modifiers(session_id,modifier_type);

CREATE TABLE session_effect_tasks (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES game_sessions(id),
  task_type text NOT NULL CHECK (task_type IN ('choice_mission','choose_destination')),
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved','cancelled')),
  revision bigint NOT NULL DEFAULT 0,
  source_command_id uuid NOT NULL REFERENCES game_commands(command_id),
  source_effect_index integer NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  resolved_at timestamptz(3),
  UNIQUE(source_command_id,source_effect_index)
);
CREATE INDEX session_effect_tasks_pending ON session_effect_tasks(session_id,status,created_at);

CREATE TABLE session_movement_locks (
  session_id uuid PRIMARY KEY REFERENCES game_sessions(id),
  release_type text NOT NULL CHECK (release_type IN ('operator','skip_rolls','skip_rolls_or_doubles','dice_faces')),
  rolls_remaining integer,
  release_payload jsonb NOT NULL,
  source_command_id uuid NOT NULL REFERENCES game_commands(command_id),
  source_effect_index integer NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  UNIQUE(source_command_id,source_effect_index)
);

ALTER TABLE missions ADD COLUMN duration_seconds integer CHECK (duration_seconds > 0 AND duration_seconds <= 86400);
ALTER TABLE game_commands DROP CONSTRAINT game_commands_type_check;
ALTER TABLE game_commands ADD CONSTRAINT game_commands_type_check CHECK (type IN ('create_session','roll_dice','set_direction','set_position','pause','resume','end_session','adjust_inventory','create_mission','complete_mission','waive_mission','use_shield','choose_destination','cancel_destination','adjust_counter','clear_movement_lock','clear_roll_modifier'));
CREATE UNIQUE INDEX one_pending_travel_per_session ON session_effect_tasks(session_id) WHERE task_type='choose_destination' AND status='pending';

ALTER TABLE missions ADD CONSTRAINT settlement_fields_together CHECK (
  (settlement_counter_id IS NULL AND settlement_amount IS NULL AND settlement_on IS NULL) OR
  (settlement_counter_id IS NOT NULL AND settlement_amount IS NOT NULL AND settlement_on IS NOT NULL)
);
ALTER TABLE missions ADD CONSTRAINT settlement_counter_exists FOREIGN KEY (session_id,settlement_counter_id) REFERENCES session_counters(session_id,counter_id);

CREATE UNIQUE INDEX missions_manual_command ON missions(created_by_command_id) WHERE source_effect_index IS NULL;
CREATE UNIQUE INDEX inventory_ledger_manual_command ON inventory_ledger(command_id) WHERE source_effect_index IS NULL;
