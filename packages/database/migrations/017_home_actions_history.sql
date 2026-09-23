ALTER TABLE game_commands DROP CONSTRAINT game_commands_type_check;
ALTER TABLE game_commands ADD CONSTRAINT game_commands_type_check CHECK (type IN (
  'create_session','roll_dice','set_direction','set_position','pause','resume','end_session',
  'adjust_inventory','create_mission','complete_mission','waive_mission','use_shield',
  'choose_destination','cancel_destination','adjust_counter','clear_movement_lock',
  'set_movement_lock_remaining','clear_roll_modifier','apply_board_version'
));

CREATE INDEX game_commands_session_history_idx
  ON game_commands (session_id, after_revision DESC, command_id DESC);
