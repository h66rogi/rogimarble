ALTER TABLE game_sessions ADD COLUMN presentation_epoch bigint NOT NULL DEFAULT 1 CHECK (presentation_epoch > 0);
ALTER TABLE game_commands ADD COLUMN session_epoch integer NOT NULL DEFAULT 1 CHECK (session_epoch > 0);
ALTER TABLE game_commands ADD COLUMN presentation_epoch bigint NOT NULL DEFAULT 1 CHECK (presentation_epoch > 0);

ALTER TABLE game_commands DROP CONSTRAINT game_commands_type_check;
ALTER TABLE game_commands ADD CONSTRAINT game_commands_type_check CHECK (type IN (
  'create_session','roll_dice','set_direction','set_position','pause','resume','end_session',
  'adjust_inventory','create_mission','complete_mission','waive_mission','use_shield'
));

CREATE TABLE item_definitions (
  channel_id text NOT NULL REFERENCES channels(id),
  item_id text NOT NULL,
  name text NOT NULL,
  max_quantity integer NOT NULL DEFAULT 100000 CHECK (max_quantity > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id,item_id)
);

CREATE TABLE session_inventory (
  session_id uuid NOT NULL REFERENCES game_sessions(id),
  item_id text NOT NULL,
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id,item_id)
);

CREATE TABLE inventory_ledger (
  id uuid PRIMARY KEY,
  command_id uuid NOT NULL UNIQUE REFERENCES game_commands(command_id),
  session_id uuid NOT NULL REFERENCES game_sessions(id),
  item_id text NOT NULL,
  before_quantity integer NOT NULL,
  delta integer NOT NULL,
  after_quantity integer NOT NULL,
  before_revision bigint NOT NULL,
  after_revision bigint NOT NULL,
  operator_id uuid NOT NULL REFERENCES operators(id),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE missions (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES game_sessions(id),
  message text NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0 AND quantity <= 100000),
  status text NOT NULL CHECK (status IN ('pending','completed','waived','shielded')),
  shield_item_id text,
  shield_quantity integer CHECK (shield_quantity > 0),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_by_command_id uuid NOT NULL UNIQUE REFERENCES game_commands(command_id),
  resolved_by_command_id uuid UNIQUE REFERENCES game_commands(command_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CHECK ((shield_item_id IS NULL) = (shield_quantity IS NULL))
);
CREATE INDEX missions_session_status ON missions(session_id,status,created_at);
