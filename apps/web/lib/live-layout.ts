import type { AuthSessionResponse, OverlayLayoutDto, OverlayLayoutSnapshotDto } from '@rogimarble/contracts';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';
const CHANNEL_ID = process.env.NEXT_PUBLIC_CHANNEL_ID ?? 'demo-channel';

export class LiveLayoutError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function liveRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const csrf = typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem('rogimarble.csrf');
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    cache: 'no-store',
    headers: {
      'content-type': 'application/json',
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string | string[] } | null;
    const detail = Array.isArray(payload?.message) ? payload.message.join(', ') : payload?.message;
    const safeMessage = response.status === 401
      ? '로그인이 필요합니다.'
      : response.status === 403
        ? '실시간 배치를 변경할 권한이 없습니다.'
        : response.status === 409
          ? '다른 운영자가 먼저 배치를 변경했습니다.'
          : detail || '실시간 배치를 저장하지 못했습니다.';
    throw new LiveLayoutError(safeMessage, response.status);
  }
  return response.json() as Promise<T>;
}

const livePath = `/v1/channels/${encodeURIComponent(CHANNEL_ID)}/overlay-layout/live`;

export const liveLayoutApi = {
  get: () => liveRequest<OverlayLayoutSnapshotDto>(livePath),
  put: (layout: OverlayLayoutDto, expectedVersion: number) => liveRequest<OverlayLayoutSnapshotDto>(livePath, {
    method: 'PUT',
    body: JSON.stringify({ layout, expectedVersion }),
  }),
  session: () => liveRequest<AuthSessionResponse>('/v1/auth/session'),
};
