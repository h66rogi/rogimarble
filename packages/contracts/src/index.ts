export const API_V1 = "/v1" as const;

export type SessionStatus = "ready" | "running" | "paused" | "ended";
export type Direction = "forward" | "reverse";
export type OperatorCommandType =
  | "create_session"
  | "roll_dice"
  | "set_direction"
  | "set_position"
  | "pause"
  | "resume"
  | "end_session"
  | "adjust_inventory"
  | "create_mission"
  | "complete_mission"
  | "waive_mission"
  | "use_shield";
export type OperatorCommandStatus = "completed" | "rejected";

export interface LoginRequest {
  readonly username: string;
  readonly password: string;
}
export interface LoginResponse {
  readonly operator: {
    readonly id: string;
    readonly username: string;
    readonly role: "admin" | "operator" | "viewer";
  };
  readonly csrfToken: string;
}
export interface AuthConfigResponse {
  readonly mode: "local" | "shared";
  readonly loginUrl: string | null;
  readonly sharedCookieEnabled: boolean;
  readonly message: string | null;
}
export type AuthSessionResponse = LoginResponse;

export type AdminRole = "admin" | "operator" | "viewer";
export type ChannelPermission = "manage" | "operate" | "view";
export interface AdminLoginResponse {
  readonly admin: { readonly id: string; readonly username: string };
  readonly csrfToken: string;
}
export interface AdminOperatorDto {
  readonly id: string;
  readonly username: string;
  readonly role: AdminRole;
  readonly disabledAt: string | null;
  readonly createdAt: string;
}
export interface AdminChannelMemberDto {
  readonly operatorId: string;
  readonly username: string;
  readonly permission: ChannelPermission;
}
export interface AdminChannelDto {
  readonly id: string;
  readonly displayName: string;
  readonly ownerOperatorId: string;
  readonly createdAt: string;
  readonly members: readonly AdminChannelMemberDto[];
}
export interface ExternalBindingDto {
  readonly issuer: "rogichat";
  readonly subject: string;
  readonly operatorId: string;
  readonly username: string;
  readonly createdAt: string;
}
export interface AdminAuditDto {
  readonly id: string;
  readonly adminOperatorId: string;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly before: unknown | null;
  readonly after: unknown | null;
  readonly createdAt: string;
}
export interface AdminAuditPageDto {
  readonly entries: readonly AdminAuditDto[];
  readonly nextCursor: string | null;
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
  | CommandBase<"roll_dice", { readonly count?: number }>
  | CommandBase<"set_direction", { readonly direction: Direction }>
  | CommandBase<
      "set_position",
      {
        readonly cellId: string;
        readonly pauseAutomaticMovement: true;
        readonly triggerArrivalEffects: false;
      }
    >
  | CommandBase<"pause" | "resume" | "end_session", Record<string, never>>
  | CommandBase<
      "adjust_inventory",
      {
        readonly itemId: string;
        readonly mode: "delta" | "set";
        readonly quantity: number;
        readonly expectedInventoryRevision: number;
      }
    >
  | CommandBase<
      "create_mission",
      {
        readonly message: string;
        readonly quantity?: number;
        readonly shield: {
          readonly itemId: string;
          readonly quantity: number;
        } | null;
      }
    >
  | CommandBase<
      "complete_mission" | "waive_mission",
      {
        readonly missionId: string;
        readonly expectedMissionRevision: number;
      }
    >
  | CommandBase<
      "use_shield",
      {
        readonly missionId: string;
        readonly expectedMissionRevision: number;
        readonly expectedInventoryRevision: number;
      }
    >;

export interface RollResultDto {
  readonly dice: readonly number[];
  readonly distance: number;
  readonly direction: Direction;
  readonly path: readonly string[];
  readonly fromCellId: string;
  readonly toCellId: string;
}

export interface SessionCommandDto {
  readonly commandId: string;
  readonly sessionId: string;
  readonly sessionEpoch: number;
  readonly presentationEpoch: number;
  readonly type: OperatorCommandType;
  readonly status: OperatorCommandStatus;
  readonly operatorId: string;
  readonly beforeRevision: number;
  readonly afterRevision: number;
  readonly result:
    | RollResultDto
    | { readonly direction: Direction }
    | {
        readonly fromCellId: string;
        readonly toCellId: string;
        readonly automaticMovementPaused: true;
      }
    | { readonly status: SessionStatus }
    | { readonly inventory: InventoryItemDto }
    | { readonly mission: MissionDto; readonly inventory?: InventoryItemDto }
    | GameSessionDto
    | null;
  readonly rejectionCode: "unsupported_board_effect" | null;
  readonly createdAt: string;
}

export interface InventoryItemDto {
  readonly itemId: string;
  readonly name: string;
  readonly quantity: number;
  readonly revision: number;
  readonly updatedAt: string;
}
export interface InventoryLedgerDto {
  readonly id: string;
  readonly commandId: string;
  readonly itemId: string;
  readonly beforeQuantity: number;
  readonly delta: number;
  readonly afterQuantity: number;
  readonly beforeRevision: number;
  readonly afterRevision: number;
  readonly operatorId: string;
  readonly reason: string;
  readonly createdAt: string;
}
export interface MissionDto {
  readonly id: string;
  readonly message: string;
  readonly quantity: number;
  readonly status: "pending" | "completed" | "waived" | "shielded";
  readonly shield: {
    readonly itemId: string;
    readonly quantity: number;
  } | null;
  readonly revision: number;
  readonly createdAt: string;
  readonly resolvedAt: string | null;
}

export interface OperatorStateDto {
  readonly session: GameSessionDto | null;
  readonly inventory: readonly InventoryItemDto[];
  readonly missions: readonly MissionDto[];
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

export const operatorApi = {
  health: "/health",
  readiness: "/ready",
  login: `${API_V1}/auth/login`,
  logout: `${API_V1}/auth/logout`,
  authConfig: `${API_V1}/auth/config`,
  authSession: `${API_V1}/auth/session`,
  operatorState: (channelId: string) =>
    `${API_V1}/channels/${channelId}/operator-state`,
  runnableBoards: (channelId: string) =>
    `${API_V1}/channels/${channelId}/board-versions/runnable`,
  sessions: (channelId: string) => `${API_V1}/channels/${channelId}/sessions`,
  commands: (channelId: string, sessionId: string) =>
    `${API_V1}/channels/${channelId}/sessions/${sessionId}/commands`,
  inventoryLedger: (channelId: string, sessionId: string) =>
    `${API_V1}/channels/${channelId}/sessions/${sessionId}/inventory-ledger`,
  missions: (channelId: string, sessionId: string) =>
    `${API_V1}/channels/${channelId}/sessions/${sessionId}/missions`,
  command: (channelId: string, commandId: string) =>
    `${API_V1}/channels/${channelId}/commands/${commandId}`,
} as const;

export const adminApi = {
  login: `${API_V1}/admin/auth/login`,
  session: `${API_V1}/admin/auth/session`,
  logout: `${API_V1}/admin/auth/logout`,
  changePassword: `${API_V1}/admin/auth/password`,
  operators: `${API_V1}/admin/operators`,
  operator: (id: string) => `${API_V1}/admin/operators/${id}`,
  resetPassword: (id: string) =>
    `${API_V1}/admin/operators/${id}/reset-password`,
  channels: `${API_V1}/admin/channels`,
  channel: (id: string) => `${API_V1}/admin/channels/${id}`,
  channelMember: (channelId: string, operatorId: string) =>
    `${API_V1}/admin/channels/${channelId}/members/${operatorId}`,
  externalBindings: `${API_V1}/admin/external-bindings`,
  externalBinding: (issuer: string, subject: string) =>
    `${API_V1}/admin/external-bindings/${issuer}/${subject}`,
  audit: `${API_V1}/admin/audit`,
} as const;
