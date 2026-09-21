export const API_V1 = '/v1' as const;

export type SessionStatus = 'ready' | 'running' | 'paused' | 'ended';
export type Direction = 'forward' | 'reverse';
export type OperatorCommandType = 'create_session' | 'roll_dice' | 'set_direction' | 'set_position' |
  'pause' | 'resume' | 'end_session' | 'adjust_inventory' | 'create_mission' |
  'complete_mission' | 'waive_mission' | 'use_shield' | 'choose_destination' | 'cancel_destination' | 'adjust_counter' | 'clear_movement_lock' | 'clear_roll_modifier' | 'apply_board_version';

export type OperatorCommandStatus = 'completed' | 'rejected';

export interface LoginRequest {
  readonly username: string;
  readonly password: string;
}
export interface TokenLoginRequest {
  readonly token: string;
}
export interface LoginResponse {
  readonly operator: {
    readonly id: string;
    readonly username: string;
    readonly role: 'admin' | 'operator' | 'viewer';
  };
  readonly csrfToken: string;
  readonly authMode?: 'local' | 'token';
}
export interface AuthConfigResponse {
  readonly mode: 'token';
  readonly loginUrl: null;
  readonly localLoginEnabled: false;
}
export type AuthSessionResponse = LoginResponse;
export interface AccessTokenDto {
  readonly id: string;
  readonly label: string;
  readonly expiresAt: string;
  readonly lastUsedAt: string | null;
  readonly revokedAt: string | null;
  readonly createdAt: string;
}
export interface IssuedAccessTokenDto extends AccessTokenDto {
  readonly token: string;
}
export interface IssueAccessTokenRequest {
  readonly label: string;
  readonly expiresAt?: string;
}

export interface GameSessionDto {
  readonly id: string;
  readonly channelId: string;
  readonly status: SessionStatus;
  readonly sessionEpoch: number;
  readonly revision: number;
  readonly boardVersionId: string;
  readonly currentCellId: string;
  readonly direction: Direction;
  readonly automaticMovementPaused: boolean;
  readonly presentationEpoch: number;
  readonly previewOnly: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateSessionRequest {
  readonly commandId: string;
  readonly boardVersionId: string;
  readonly initialCellId: string;
  readonly direction?: Direction;
}

interface CommandBase<T extends OperatorCommandType, P> {
  readonly commandId: string;
  readonly sessionEpoch: number;
  readonly expectedRevision: number;
  readonly type: T;
  readonly reason: string;
  readonly payload: P;
}

export type SessionCommandRequest =
  | CommandBase<'roll_dice', { readonly count?: number }>
  | CommandBase<'set_direction', { readonly direction: Direction }>
  | CommandBase<'set_position', {
      readonly cellId: string;
      readonly pauseAutomaticMovement: true;
      readonly triggerArrivalEffects: boolean;
    }>
  | CommandBase<'pause' | 'resume' | 'end_session', Record<string, never>>
  | CommandBase<'adjust_inventory', {
      readonly itemId: string;
      readonly mode: 'delta' | 'set';
      readonly quantity: number;
      readonly expectedInventoryRevision: number;
    }>
  | CommandBase<'create_mission', {
      readonly message: string;
      readonly quantity?: number;
      readonly shield: { readonly itemId: string; readonly quantity: number } | null;
    }>
  | CommandBase<'complete_mission' | 'waive_mission', {
      readonly missionId: string;
      readonly expectedMissionRevision: number;
    }>
  | CommandBase<'use_shield', {
      readonly missionId: string;
      readonly expectedMissionRevision: number;
      readonly expectedInventoryRevision: number;
    }>
  | CommandBase<'choose_destination', { readonly taskId: string; readonly cellId: string; readonly expectedTaskRevision: number }>
  | CommandBase<'cancel_destination', { readonly taskId: string; readonly expectedTaskRevision: number }>
  | CommandBase<'adjust_counter', { readonly counterId: string; readonly quantity: number; readonly expectedCounterRevision: number }>
  | CommandBase<'clear_movement_lock', Record<string, never>>
  | CommandBase<'clear_roll_modifier', { readonly modifierId: string }>
  | CommandBase<'apply_board_version', { readonly boardVersionId: string }>;

export interface RollResultDto {
  readonly dice: readonly number[];
  readonly distance: number;
  readonly direction: Direction;
  readonly path: readonly string[];
  readonly fromCellId: string;
  readonly toCellId: string;
  readonly effects?: readonly ArrivalEffectResultDto[];
}
export interface ArrivalEffectResultDto { readonly index:number; readonly cellId:string; readonly trigger:'pass'|'land'; readonly type:string; readonly result:unknown }
export interface SessionCounterDto { readonly counterId:string; readonly label:string; readonly unit:string; readonly value:number; readonly reserved:number; readonly available:number; readonly revision:number }
export interface SessionEffectTaskDto { readonly id:string; readonly type:'choice_mission'|'choose_destination'|'donation_destination'; readonly payload:unknown; readonly status:'pending'|'resolved'|'cancelled'; readonly revision:number; readonly createdAt:string }
export interface SessionMovementLockDto { readonly releaseType:'operator'|'skip_rolls'|'skip_rolls_or_doubles'|'dice_faces'; readonly rollsRemaining:number|null; readonly release:unknown; readonly createdAt:string }
export interface SessionRollModifierDto { readonly id:string; readonly type:'movement_multiplier'; readonly factor:number; readonly usesRemaining:number; readonly createdAt:string }

export interface SessionCommandDto {
  readonly commandId: string;
  readonly sessionId: string;
  readonly sessionEpoch: number;
  readonly presentationEpoch: number;
  readonly type: OperatorCommandType;
  readonly status: OperatorCommandStatus;
  readonly operatorId: string | null;
  readonly source?: 'operator' | 'donation';
  readonly beforeRevision: number;
  readonly afterRevision: number;
  readonly result: RollResultDto | { readonly direction: Direction } |
    { readonly fromCellId: string; readonly toCellId: string; readonly automaticMovementPaused: true } |
    { readonly status: SessionStatus } | { readonly inventory: InventoryItemDto } |
    { readonly mission: MissionDto; readonly inventory?: InventoryItemDto } |
    { readonly previousBoardVersionId:string; readonly boardVersionId:string } | GameSessionDto | null;
  readonly rejectionCode: 'unsupported_board_effect' | null;
  readonly createdAt: string;
}

export interface InventoryItemDto {
  readonly itemId: string; readonly name: string; readonly quantity: number;
  readonly revision: number; readonly updatedAt: string;
}
export interface InventoryLedgerDto {
  readonly id: string; readonly commandId: string; readonly itemId: string;
  readonly beforeQuantity: number; readonly delta: number; readonly afterQuantity: number;
  readonly beforeRevision: number; readonly afterRevision: number; readonly operatorId: string;
  readonly reason: string; readonly createdAt: string;
}
export interface MissionDto {
  readonly durationSeconds?: number | null;
  readonly id: string; readonly message: string; readonly quantity: number;
  readonly status: 'pending' | 'completed' | 'waived' | 'shielded';
  readonly shield: { readonly itemId: string; readonly quantity: number } | null;
  readonly revision: number; readonly createdAt: string; readonly resolvedAt: string | null;
}

export interface PawnImageDto {
  readonly assetId:string; readonly url:string; readonly mimeType:'image/png'|'image/jpeg'|'image/webp';
  readonly width:number; readonly height:number; readonly source:'upload'; readonly updatedAt:string;
}
export interface PawnAppearanceDto { readonly revision:number; readonly image:PawnImageDto|null }

export interface OperatorStateDto {
  readonly latestCommand?: SessionCommandDto | null;
  readonly session: GameSessionDto | null;
  readonly boardDefinition: unknown | null;
  readonly inventory: readonly InventoryItemDto[];
  readonly missions: readonly MissionDto[];
  readonly counters?: readonly SessionCounterDto[];
  readonly effectTasks?: readonly SessionEffectTaskDto[];
  readonly movementLock?: SessionMovementLockDto | null;
  readonly rollModifiers?: readonly SessionRollModifierDto[];
  readonly pawnAppearance: PawnAppearanceDto;
  readonly capabilities: {
    readonly manualRoll: boolean;
    readonly setDirection: boolean;
    readonly setPosition: boolean;
    readonly arrivalEffects: boolean;
    readonly donations: boolean;
    readonly inventory: boolean;
    readonly missions: boolean;
    readonly sessionLifecycle: boolean;
  };
}

export interface RunnableBoardVersionDto {
  readonly id: string;
  readonly boardId: string;
  readonly name: string;
  readonly path: readonly string[];
  readonly initialCellId: string;
  readonly previewOnly: boolean;
}

export interface ApiErrorDto {
  readonly statusCode: number;
  readonly code: string;
  readonly message: string;
}

export type ChannelConfigKind = 'rules' | 'items' | 'board' | 'overlay-layout';
export interface ChannelConfigVersionDto {
  readonly id: string; readonly channelId: string; readonly kind: ChannelConfigKind;
  readonly revision: number; readonly status: 'draft'|'validated'|'published'|'superseded';
  readonly document: unknown; readonly validationErrors: readonly string[];
  readonly createdAt: string; readonly updatedAt: string; readonly publishedAt: string|null;
}
export interface ChannelConfigStateDto { readonly draft: ChannelConfigVersionDto|null; readonly published: ChannelConfigVersionDto|null; readonly effectiveDocument?: unknown }
export interface DonationEventDto { readonly id:string; readonly sessionId:string|null; readonly donorDisplayName:string; readonly amount:number; readonly message:string|null; readonly ruleId:string|null; readonly result:'matched'|'no_match'|'failed'|'pending'|'held'|'ignored'; readonly resultDetail:unknown; readonly occurredAt:string }
export interface DonationPageDto { readonly items:readonly DonationEventDto[]; readonly nextCursor:string|null; readonly collectionConnected:boolean }
export interface OperationPageDto { readonly items:readonly unknown[]; readonly nextCursor:string|null }
export interface ObsTokenDto { readonly id:string; readonly label:string; readonly tokenSuffix:string; readonly createdAt:string; readonly lastUsedAt:string|null; readonly revokedAt:string|null }
export interface IssuedObsTokenDto extends ObsTokenDto { readonly token:string; readonly overlayUrlPath:string }
export interface OverlayPresentationCommandDto { readonly commandId:string; readonly sessionId:string; readonly sessionEpoch:number; readonly presentationEpoch:number; readonly type:OperatorCommandType; readonly afterRevision:number; readonly result:SessionCommandDto['result']; readonly createdAt:string }
export type OverlayWidgetId='board'|'dice'|'current_mission'|'inventory'|'direction';
export interface OverlayLayoutDto { readonly schemaVersion:1; readonly width:number; readonly height:number; readonly aspectRatio:'16:9'|'9:16'|'4:3'|'custom'; readonly background:string; readonly widgets:readonly {readonly id:OverlayWidgetId;readonly bounds:{readonly x:number;readonly y:number;readonly width:number;readonly height:number};readonly z:number}[] }
export function validateOverlayLayout(value:unknown):asserts value is OverlayLayoutDto {if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError('overlay layout must be an object');const x=value as any;if(Object.keys(x).some(k=>!['schemaVersion','width','height','aspectRatio','background','widgets'].includes(k))||x.schemaVersion!==1)throw new TypeError('overlay layout schema is invalid');for(const key of ['width','height'])if(!Number.isInteger(x[key])||x[key]<1||x[key]>7680)throw new TypeError(`${key} must be 1-7680`);if(!['16:9','9:16','4:3','custom'].includes(x.aspectRatio))throw new TypeError('aspectRatio is unsupported');const ratios:Record<string,number>={'16:9':16/9,'9:16':9/16,'4:3':4/3};if(x.aspectRatio!=='custom'&&Math.abs(x.width/x.height-ratios[x.aspectRatio])>0.01)throw new TypeError('width and height must match aspectRatio');if(typeof x.background!=='string'||x.background.length>100)throw new TypeError('background must be text');if(!Array.isArray(x.widgets)||x.widgets.length>5)throw new TypeError('widgets must be an array of at most 5');const allowed=['board','dice','current_mission','inventory','direction'],ids=new Set<string>();for(const widget of x.widgets){if(!widget||typeof widget!=='object'||Object.keys(widget).some(k=>!['id','bounds','z'].includes(k))||!allowed.includes(widget.id)||ids.has(widget.id))throw new TypeError('widget id is invalid or duplicated');ids.add(widget.id);if(!Number.isSafeInteger(widget.z)||widget.z<0||widget.z>100)throw new TypeError('widget z must be 0-100');const b=widget.bounds;if(!b||Object.keys(b).some(k=>!['x','y','width','height'].includes(k)))throw new TypeError('widget bounds are invalid');for(const key of ['x','y','width','height'])if(typeof b[key]!=='number'||!Number.isFinite(b[key])||b[key]<0||b[key]>1)throw new TypeError('widget bounds must be finite normalized numbers');if(b.width===0||b.height===0||b.x+b.width>1||b.y+b.height>1)throw new TypeError('widget is outside layout');}}
export interface OverlayStateDto { readonly channelId:string; readonly session:GameSessionDto|null; readonly boardDefinition:unknown|null; readonly latestCommand?:OverlayPresentationCommandDto|null; readonly inventory:readonly InventoryItemDto[]; readonly missions:readonly MissionDto[]; readonly pawnAppearance:PawnAppearanceDto; readonly layout:unknown|null; readonly capabilities:{readonly arrivalEffects:boolean;readonly donations:boolean} }

export const operatorApi = {
  health: '/health',
  readiness: '/ready',
  login: `${API_V1}/auth/login`,
  logout: `${API_V1}/auth/logout`,
  authConfig: `${API_V1}/auth/config`,
  authSession: `${API_V1}/auth/session`,
  operatorState: (channelId: string) => `${API_V1}/channels/${channelId}/operator-state`,
  runnableBoards: (channelId: string) => `${API_V1}/channels/${channelId}/board-versions/runnable`,
  sessions: (channelId: string) => `${API_V1}/channels/${channelId}/sessions`,
  commands: (channelId: string, sessionId: string) =>
    `${API_V1}/channels/${channelId}/sessions/${sessionId}/commands`,
  inventoryLedger: (channelId: string, sessionId: string) =>
    `${API_V1}/channels/${channelId}/sessions/${sessionId}/inventory-ledger`,
  missions: (channelId: string, sessionId: string) =>
    `${API_V1}/channels/${channelId}/sessions/${sessionId}/missions`,
  command: (channelId: string, commandId: string) => `${API_V1}/channels/${channelId}/commands/${commandId}`,
  config: (channelId:string,kind:ChannelConfigKind) => `${API_V1}/channels/${channelId}/config/${kind}`,
  donations: (channelId:string) => `${API_V1}/channels/${channelId}/donations`,
  operations: (channelId:string) => `${API_V1}/channels/${channelId}/operations`,
  obsTokens: (channelId:string) => `${API_V1}/channels/${channelId}/obs-tokens`,
  pawnImage: (channelId:string) => `${API_V1}/channels/${channelId}/pawn-image`,
  overlayState: `${API_V1}/overlay/state`,
} as const;
