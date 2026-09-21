import { operatorApi, type AccessTokenDto, type ChannelConfigKind, type ChannelConfigStateDto, type ChannelConfigVersionDto, type DonationPageDto, type GameSessionDto, type IssuedAccessTokenDto, type IssuedObsTokenDto, type LoginResponse, type ObsTokenDto, type OperationPageDto, type OperatorStateDto, type OverlayStateDto, type RunnableBoardVersionDto, type SessionCommandDto, type SessionCommandRequest } from '@rogimarble/contracts';
import type { OperatorCommand, OperatorSnapshot } from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';
export interface AuthConfig { mode: 'token'; loginUrl: null; localLoginEnabled: false }

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}
export class PendingCommandError extends Error { constructor() { super('명령 결과를 확인하고 있습니다. 새 명령은 잠시 기다려 주세요.'); } }
export interface PendingIntent { kind: 'session-command' | 'create-session'; commandId: string; sessionId: string | null; path: string; body: string; createdAt: number }
const PENDING_KEY = 'rogimarble.pending-command.v1';

export function getPendingIntent(): PendingIntent | null {
  if (typeof sessionStorage === 'undefined') return null;
  try { return JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? 'null') as PendingIntent | null; } catch { return null; }
}
function savePending(value: PendingIntent | null) { if (typeof sessionStorage === 'undefined') return; if (value) sessionStorage.setItem(PENDING_KEY, JSON.stringify(value)); else sessionStorage.removeItem(PENDING_KEY); }
function isDefinitiveMutationRejection(error: unknown) { return error instanceof ApiError && error.status >= 400 && error.status < 500 && ![401, 403, 408].includes(error.status); }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...(typeof sessionStorage !== 'undefined' && sessionStorage.getItem('rogimarble.csrf') ? { 'X-CSRF-Token': sessionStorage.getItem('rogimarble.csrf')! } : {}), ...init?.headers },
  });
  if (!response.ok) {
    const raw = await response.text();
    let message = '';
    try {
      const payload = JSON.parse(raw) as { message?: string | string[] };
      message = Array.isArray(payload.message) ? payload.message.join(', ') : payload.message ?? '';
    } catch {
      message = '';
    }
    throw new ApiError(message || '요청을 처리하지 못했습니다.', response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export interface CollectorStatus { enabled:boolean;transport:string;collectionState:string;collectionActive:boolean;lastCheckedAt:string|null;lastAcceptedAt:string|null;errorCode:string|null;chatConnected:boolean;counts?:Record<string,number> }

export const api = {
  collectorStatus:()=>request<CollectorStatus>(`/v1/channels/${encodeURIComponent(channelId())}/collector`,{cache:'no-store'}),
  login: async (username: string, password: string) => { const result = await request<LoginResponse>(operatorApi.login, { method: 'POST', body: JSON.stringify({ username, password }) }); sessionStorage.setItem('rogimarble.csrf', result.csrfToken); return result; },
  loginToken: async (token: string) => { const result=await request<LoginResponse>('/v1/auth/token',{method:'POST',body:JSON.stringify({token})});sessionStorage.setItem('rogimarble.csrf',result.csrfToken);return result; },
  authConfig: () => request<AuthConfig>('/v1/auth/config', { cache: 'no-store' }),
  bootstrapSession: async () => { const result = await request<LoginResponse>('/v1/auth/session', { cache: 'no-store' }); sessionStorage.setItem('rogimarble.csrf', result.csrfToken); return result; },
  changePassword: (currentPassword: string, newPassword: string) => request<void>('/v1/auth/password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
  logout: async () => { await request<void>('/v1/auth/logout', { method: 'POST' }); if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('rogimarble.csrf'); },
  accessTokens:()=>request<readonly AccessTokenDto[]>('/v1/auth/tokens',{cache:'no-store'}),
  issueAccessToken:(label:string,expiresAt?:string)=>request<IssuedAccessTokenDto>('/v1/auth/tokens',{method:'POST',body:JSON.stringify({label,...(expiresAt?{expiresAt}:{})})}),
  revokeAccessToken:(id:string)=>request<void>(`/v1/auth/tokens/${encodeURIComponent(id)}`,{method:'DELETE'}),
  snapshot: async () => adaptState(await request<OperatorStateDto>(operatorApi.operatorState(channelId()), { cache: 'no-store' })),
  runnableBoards: () => request<readonly RunnableBoardVersionDto[]>(operatorApi.runnableBoards(channelId()), { cache: 'no-store' }),
  config: (kind: ChannelConfigKind) => request<ChannelConfigStateDto>(operatorApi.config(channelId(), kind), { cache: 'no-store' }),
  createConfigDraft: (kind: ChannelConfigKind, document: unknown) => request<ChannelConfigVersionDto>(operatorApi.config(channelId(), kind), { method: 'POST', body: JSON.stringify({ document }) }),
  updateConfigDraft: (kind: ChannelConfigKind, versionId: string, expectedRevision: number, document: unknown) => request<ChannelConfigVersionDto>(`${operatorApi.config(channelId(), kind)}/${versionId}`, { method: 'PUT', body: JSON.stringify({ expectedRevision, document }) }),
  validateConfig: (kind: ChannelConfigKind, versionId: string, expectedRevision: number) => request<ChannelConfigVersionDto>(`${operatorApi.config(channelId(), kind)}/${versionId}/validate`, { method: 'POST', body: JSON.stringify({ expectedRevision }) }),
  publishConfig: (kind: ChannelConfigKind, versionId: string, expectedRevision: number) => request<ChannelConfigVersionDto>(`${operatorApi.config(channelId(), kind)}/${versionId}/publish`, { method: 'POST', body: JSON.stringify({ expectedRevision }) }),
  donations: (filters: { donor?: string; result?: string; cursor?: string } = {}) => request<DonationPageDto>(`${operatorApi.donations(channelId())}?${new URLSearchParams({ limit: '50', ...filters })}`, { cache: 'no-store' }),
  operations: (cursor?: string) => request<OperationPageDto>(`${operatorApi.operations(channelId())}?${new URLSearchParams({ limit: '50', ...(cursor ? { cursor } : {}) })}`, { cache: 'no-store' }),
  obsTokens: () => request<readonly ObsTokenDto[]>(operatorApi.obsTokens(channelId()), { cache: 'no-store' }),
  issueObsToken: (label: string) => request<IssuedObsTokenDto>(operatorApi.obsTokens(channelId()), { method: 'POST', body: JSON.stringify({ label }) }),
  revokeObsToken: (tokenId: string) => request<void>(`${operatorApi.obsTokens(channelId())}/${tokenId}`, { method: 'DELETE' }),
  createSession: async (board: RunnableBoardVersionDto) => {
    if (getPendingIntent()) throw new PendingCommandError();
    const commandId = crypto.randomUUID();
    const pending = { kind: 'create-session', commandId, sessionId: null, path: operatorApi.sessions(channelId()), body: JSON.stringify({ commandId, boardVersionId: board.id, initialCellId: board.initialCellId, direction: 'forward' }), createdAt: Date.now() } satisfies PendingIntent;
    savePending(pending);
    try { await request<GameSessionDto>(pending.path, { method: 'POST', body: pending.body }); }
    catch (error) { if (isDefinitiveMutationRejection(error)) { savePending(null); throw error; } try { return (await reconcileIntent(pending)).snapshot; } catch { throw new PendingCommandError(); } }
    try { const snapshot = await api.snapshot(); savePending(null); return snapshot; } catch { throw new PendingCommandError(); }
  },
  command: async (sessionId: string, command: OperatorCommand, sessionEpoch: number) => {
    if (getPendingIntent()) throw new PendingCommandError();
    const base = { commandId: crypto.randomUUID(), sessionEpoch, expectedRevision: command.expectedRevision, reason: command.reason };
    const body: SessionCommandRequest = command.type === 'adjust_counter'
      ? { ...base, type: 'adjust_counter', payload: { counterId: command.counterId, quantity: command.quantity, expectedCounterRevision: command.expectedCounterRevision } }
      : command.type === 'clear_movement_lock' ? { ...base, type: 'clear_movement_lock', payload: {} }
      : command.type === 'clear_roll_modifier' ? { ...base, type: 'clear_roll_modifier', payload: { modifierId: command.modifierId } }
      : command.type === 'cancel_destination' ? { ...base, type: 'cancel_destination', payload: { taskId: command.taskId, expectedTaskRevision: command.expectedTaskRevision } }
      : command.type === 'choose_destination'
      ? { ...base, type: 'choose_destination', payload: { taskId: command.taskId, cellId: command.cellId, expectedTaskRevision: command.expectedTaskRevision } }
      : command.type === 'roll'
      ? { ...base, type: 'roll_dice', payload: {} }
      : command.type === 'set_direction'
        ? { ...base, type: 'set_direction', payload: { direction: command.direction } }
        : command.type === 'correct_position'
          ? { ...base, type: 'set_position', payload: { cellId: command.cellId, pauseAutomaticMovement: true, triggerArrivalEffects: command.triggerArrivalEffects ?? false } }
          : command.type === 'pause' || command.type === 'resume' || command.type === 'end_session'
            ? { ...base, type: command.type, payload: {} }
            : command.type === 'adjust_inventory'
              ? { ...base, type: 'adjust_inventory', payload: { itemId: command.itemId, mode: command.mode, quantity: command.quantity, expectedInventoryRevision: command.expectedInventoryRevision } }
              : command.type === 'create_mission'
                ? { ...base, type: 'create_mission', payload: { message: command.message, quantity: command.quantity, shield: command.shield } }
                : command.type === 'complete_mission' || command.type === 'waive_mission'
                  ? { ...base, type: command.type, payload: { missionId: command.missionId, expectedMissionRevision: command.expectedMissionRevision } }
                  : { ...base, type: 'use_shield', payload: { missionId: command.missionId, expectedMissionRevision: command.expectedMissionRevision, expectedInventoryRevision: command.expectedInventoryRevision } };
    const pending = { kind: 'session-command', commandId: base.commandId, sessionId, path: operatorApi.commands(channelId(), sessionId), body: JSON.stringify(body), createdAt: Date.now() } satisfies PendingIntent;
    savePending(pending);
    let result: SessionCommandDto;
    try { result = await request<SessionCommandDto>(pending.path, { method: 'POST', body: pending.body }); }
    catch (error) { if (isDefinitiveMutationRejection(error)) { savePending(null); throw error; } try { return await reconcileIntent(pending); } catch { throw new PendingCommandError(); } }
    try { const snapshot = await api.snapshot(); savePending(null); return { snapshot, command: result }; } catch { throw new PendingCommandError(); }
  },
  pending: getPendingIntent,
  reconcilePending: async () => { const pending = getPendingIntent(); if (!pending) throw new ApiError('확인할 명령이 없습니다.', 404); return reconcileIntent(pending); },
  retryPending: async () => { const pending = getPendingIntent(); if (!pending) throw new ApiError('재시도할 명령이 없습니다.', 404); return retryIntent(pending); },
  overlay: async (token: string) => {
    const response = await fetch(`${API_BASE}/v1/overlay/state`, {
      cache: 'no-store',
      credentials: 'omit',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new ApiError('OBS 상태를 불러오지 못했습니다.', response.status);
    return response.json() as Promise<OverlayStateDto>;
  },
};

async function reconcileIntent(pending: PendingIntent) {
  const command = await request<SessionCommandDto>(operatorApi.command(channelId(), pending.commandId), { cache: 'no-store' });
  const snapshot = await api.snapshot(); savePending(null); return { snapshot, command };
}

async function retryIntent(pending: PendingIntent) {
  try { return await reconcileIntent(pending); } catch (error) { if (!(error instanceof ApiError) || error.status !== 404) throw error; }
  let command: SessionCommandDto | null = null;
  try {
    if (pending.kind === 'create-session') await request<GameSessionDto>(pending.path, { method: 'POST', body: pending.body });
    else command = await request<SessionCommandDto>(pending.path, { method: 'POST', body: pending.body });
  } catch (error) {
    if (isDefinitiveMutationRejection(error)) { savePending(null); await api.snapshot().catch(() => null); }
    throw error;
  }
  try { const snapshot = await api.snapshot(); savePending(null); return { snapshot, command }; } catch { throw new PendingCommandError(); }
}

function channelId() { return process.env.NEXT_PUBLIC_CHANNEL_ID ?? 'demo-channel'; }
function adaptState(value: OperatorStateDto): OperatorSnapshot {
  return { latestCommand: value.latestCommand, revision: value.session?.revision ?? 0, session: value.session ? { id: value.session.id, status: value.session.status, channelName: value.session.channelId, sessionEpoch: value.session.sessionEpoch, boardVersionId: value.session.boardVersionId, presentationEpoch: value.session.presentationEpoch, previewOnly: value.session.previewOnly } : null, token: { cellId: value.session?.currentCellId ?? 'cell-01', direction: value.session?.direction ?? 'forward' }, dice: null, inventory: [...value.inventory], missions: [...value.missions], counters: value.counters ?? [], effectTasks: value.effectTasks ?? [], movementLock: value.movementLock ?? null, rollModifiers: value.rollModifiers ?? [], donations: [], queue: [], capabilities: value.capabilities, boardDefinition: value.boardDefinition };
}
