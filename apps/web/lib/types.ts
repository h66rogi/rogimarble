import type { InventoryItemDto, MissionDto, PawnAppearanceDto, SessionStatus, SessionCounterDto, SessionEffectTaskDto, SessionMovementLockDto, SessionRollModifierDto, SessionCommandDto } from '@rogimarble/contracts';

export type Direction = 'forward' | 'reverse';

export type { BoardDefinition } from '@rogimarble/game-core/board';

export interface OperatorSnapshot {
  latestCommand?: SessionCommandDto | null;
  revision: number;
  session: { id: string; status: SessionStatus; channelName: string; sessionEpoch: number; boardVersionId?: string; presentationEpoch: number; previewOnly: boolean } | null;
  token: { cellId: string; direction: Direction; moving?: boolean };
  dice: { values: number[]; total: number } | null;
  inventory: InventoryItemDto[];
  missions: MissionDto[];
  counters?: readonly SessionCounterDto[];
  effectTasks?: readonly SessionEffectTaskDto[];
  movementLock?: SessionMovementLockDto | null;
  rollModifiers?: readonly SessionRollModifierDto[];
  pawnAppearance: PawnAppearanceDto;
  donations: Array<{ id: string; donor: string; quantity: number; createdAt: string; result: string }>;
  queue: Array<{ id: string; label: string; status: string }>;
  capabilities?: { manualRoll: boolean; setDirection: boolean; setPosition: boolean; arrivalEffects: boolean; donations: boolean; inventory: boolean; missions: boolean; sessionLifecycle: boolean };
  boardDefinition?: unknown | null;
}

export type OperatorCommand =
  | { type: 'adjust_counter'; counterId: string; quantity: number; expectedCounterRevision: number; expectedRevision: number; reason: string }
  | { type: 'clear_movement_lock'; expectedRevision: number; reason: string }
  | { type: 'clear_roll_modifier'; modifierId: string; expectedRevision: number; reason: string }
  | { type: 'cancel_destination'; taskId: string; expectedTaskRevision: number; expectedRevision: number; reason: string }
  | { type: 'choose_destination'; taskId: string; cellId: string; expectedTaskRevision: number; expectedRevision: number; reason: string }
  | { type: 'roll'; expectedRevision: number; reason: string }
  | { type: 'set_direction'; direction: Direction; expectedRevision: number; reason: string }
  | { type: 'correct_position'; cellId: string; pauseAutomaticMovement: true; triggerArrivalEffects?: boolean; expectedRevision: number; reason: string }
  | { type: 'pause'; expectedRevision: number; reason: string }
  | { type: 'resume'; expectedRevision: number; reason: string }
  | { type: 'end_session'; expectedRevision: number; reason: string }
  | { type: 'adjust_inventory'; itemId: string; mode: 'delta' | 'set'; quantity: number; expectedInventoryRevision: number; expectedRevision: number; reason: string }
  | { type: 'create_mission'; message: string; quantity: number; shield: { itemId: string; quantity: number } | null; expectedRevision: number; reason: string }
  | { type: 'complete_mission'; missionId: string; expectedMissionRevision: number; expectedRevision: number; reason: string }
  | { type: 'waive_mission'; missionId: string; expectedMissionRevision: number; expectedRevision: number; reason: string }
  | { type: 'use_shield'; missionId: string; expectedMissionRevision: number; expectedInventoryRevision: number; expectedRevision: number; reason: string };
