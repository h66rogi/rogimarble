import { apiClient } from "@/shared/lib/api-client";
import type {
  Channel,
  PostChannelRequestBody,
  GetChannelMyResponse,
  PutChannelIdentifierRequestBody,
  GetChannelIdentifierPermissionResponse,
  GetChannelSearchResponse,
  GetChannelSearchRequestQuery,
  GetFamousChannelsRequestQuery,
  GetFamousChannelsResponse,
  GetRecentChannelsRequestQuery,
  GetRecentChannelsResponse,
  GetAllChannelsResponse,
} from "@/domains/channel/types/channel";
import type {
  ChannelCustomPageComment,
  ChannelCustomPageCommentBody,
  ChannelCustomPageCommentsResponse,
  ChannelFeatureSettings,
  ChannelFeatureSettingsUpdate,
  ChannelMusicbookSettings,
  ChannelMusicbookSettingsUpdate,
  CopyDifficultyToProficiencyResponse,
} from "@/domains/channel/types/channel-tab";

/**
 * GET /channel/my
 */
export async function getMyChannel(): Promise<GetChannelMyResponse> {
  const response = await apiClient.get<GetChannelMyResponse>("/channel/my", {
    withCredentials: true,
  });
  return response.data;
}

/**
 * POST /channel
 */
export async function postChannel(
  body: PostChannelRequestBody
): Promise<Channel> {
  const response = await apiClient.post<Channel>("/channel", body, {
    withCredentials: true,
  });
  return response.data;
}

/**
 * GET /channel/list/famous
 */
export async function getFamousChannels(
  query?: GetFamousChannelsRequestQuery
): Promise<GetFamousChannelsResponse> {
  const response = await apiClient.get<GetFamousChannelsResponse>(
    "/channel/list/famous",
    {
      params: { limit: query?.limit ?? 10 },
    }
  );
  return response.data;
}

/**
 * GET /channel/list/recent
 */
export async function getRecentChannels(
  query?: GetRecentChannelsRequestQuery
): Promise<GetRecentChannelsResponse> {
  const response = await apiClient.get<GetRecentChannelsResponse>(
    "/channel/list/recent",
    {
      params: { limit: query?.limit ?? 10 },
    }
  );
  return response.data;
}

/**
 * GET /channel/list/all
 */
export async function getAllChannels(): Promise<GetAllChannelsResponse> {
  const response = await apiClient.get<GetAllChannelsResponse>(
    "/channel/list/all"
  );
  return response.data;
}

/**
 * PUT /channel/{identifier}
 */
export async function putChannelIdentifier(
  identifier: string,
  body: PutChannelIdentifierRequestBody
): Promise<Channel> {
  const response = await apiClient.put<Channel>(
    `/channel/${identifier}`,
    body,
    {
      withCredentials: true,
    }
  );
  return response.data;
}

/**
 * DELETE /channel/{identifier}
 */
export async function deleteChannelIdentifier(
  identifier: string
): Promise<void> {
  await apiClient.delete(`/channel/${identifier}`, { withCredentials: true });
}

/**
 * GET /channel/{identifier}
 */
export async function getChannelIdentifier(
  identifier: string
): Promise<Channel> {
  const response = await apiClient.get<Channel>(`/channel/${identifier}`);
  return response.data;
}

/**
 * GET /channel/search
 */
export async function getChannelSearch(
  query: GetChannelSearchRequestQuery
): Promise<GetChannelSearchResponse> {
  const { keyword, page, limit, expand } = query;

  const response = await apiClient.get<GetChannelSearchResponse>(
    `/channel/search`,
    {
      params: { keyword, page, limit, expand },
      withCredentials: true,
    }
  );
  return response.data;
}

/**
 * GET /channel/{identifier}/permission
 */
export async function getChannelIdentifierPermission(
  identifier: string
): Promise<GetChannelIdentifierPermissionResponse> {
  const response = await apiClient.get<GetChannelIdentifierPermissionResponse>(
    `/channel/${identifier}/permission`,
    {
      withCredentials: true,
    }
  );
  return response.data;
}

/**
 * GET /channel/{identifier}/overlay-token
 * 채널의 오버레이 토큰 조회
 */
export async function getChannelOverlayToken(
  identifier: string
): Promise<{ overlayToken: string }> {
  const response = await apiClient.get<{ overlayToken: string }>(
    `/channel/${identifier}/overlay-token`,
    {
      withCredentials: true,
    }
  );
  return response.data;
}

/**
 * PATCH /channel/{identifier}/overlay-token/regenerate
 * 채널의 오버레이 토큰 재생성
 */
export async function regenerateChannelOverlayToken(
  identifier: string
): Promise<{ overlayToken: string }> {
  const response = await apiClient.patch<{ overlayToken: string }>(
    `/channel/${identifier}/overlay-token/regenerate`,
    {},
    {
      withCredentials: true,
    }
  );
  return response.data;
}

/**
 * POST /channel/{identifier}/overlay/refresh
 * OBS 브라우저 소스 새로고침 트리거
 */
export async function refreshChannelOverlay(
  identifier: string
): Promise<void> {
  await apiClient.post(
    `/channel/${identifier}/overlay/refresh`,
    {},
    {
      withCredentials: true,
    }
  );
}

/**
 * POST /channel/{identifier}/chat/recover
 * 채팅 수집 전체 복구 (rediscover + reconnect)
 * 방송 중간에 터졌다 재시작된 후 채팅이 안 들어올 때 사용.
 */
export interface ChatRecoverResponse {
  rediscoverDispatched: boolean;
  reconnectDispatched: boolean;
  workerId?: string;
  status?: string;
}

export async function recoverChannelChat(
  identifier: string
): Promise<ChatRecoverResponse> {
  const response = await apiClient.post<ChatRecoverResponse>(
    `/channel/${identifier}/chat/recover`,
    {},
    {
      withCredentials: true,
    }
  );
  return response.data;
}

/**
 * GET /channel/{identifier}/overlay-widgets
 * 채널의 오버레이 위젯 테마 조회
 */
export async function getChannelOverlayWidgetThemes(
  identifier: string
): Promise<{ themes: Record<string, string> }> {
  const response = await apiClient.get<{ themes: Record<string, string> }>(
    `/channel/${identifier}/overlay-widgets`,
    {
      withCredentials: true,
    }
  );
  return response.data;
}

/**
 * PATCH /channel/{identifier}/overlay-widgets/{widgetType}
 * 채널의 오버레이 위젯 테마 업데이트
 */
export async function updateChannelOverlayWidgetTheme(
  identifier: string,
  widgetType: string,
  themeKey: string
): Promise<{ widgetType: string; themeKey: string }> {
  const response = await apiClient.patch<{ widgetType: string; themeKey: string }>(
    `/channel/${identifier}/overlay-widgets/${encodeURIComponent(widgetType)}`,
    { themeKey },
    {
      withCredentials: true,
    }
  );
  return response.data;
}

/**
 * GET /channel/{identifier}/custom-pages/{pageId}/comments
 */
export async function getChannelCustomPageComments(
  identifier: string,
  pageId: string
): Promise<ChannelCustomPageCommentsResponse> {
  const response = await apiClient.get<ChannelCustomPageCommentsResponse>(
    `/channel/${identifier}/custom-pages/${pageId}/comments`,
    {
      withCredentials: true,
    }
  );
  return response.data;
}

/**
 * POST /channel/{identifier}/custom-pages/{pageId}/comments
 */
export async function createChannelCustomPageComment(
  identifier: string,
  pageId: string,
  body: ChannelCustomPageCommentBody
): Promise<ChannelCustomPageComment> {
  const response = await apiClient.post<ChannelCustomPageComment>(
    `/channel/${identifier}/custom-pages/${pageId}/comments`,
    body,
    {
      withCredentials: true,
    }
  );
  return response.data;
}

/**
 * PATCH /channel/{identifier}/custom-pages/{pageId}/comments/{commentId}
 */
export async function updateChannelCustomPageComment(
  identifier: string,
  pageId: string,
  commentId: string,
  body: ChannelCustomPageCommentBody
): Promise<ChannelCustomPageComment> {
  const response = await apiClient.patch<ChannelCustomPageComment>(
    `/channel/${identifier}/custom-pages/${pageId}/comments/${commentId}`,
    body,
    {
      withCredentials: true,
    }
  );
  return response.data;
}

/**
 * DELETE /channel/{identifier}/custom-pages/{pageId}/comments/{commentId}
 */
export async function deleteChannelCustomPageComment(
  identifier: string,
  pageId: string,
  commentId: string
): Promise<void> {
  await apiClient.delete(
    `/channel/${identifier}/custom-pages/${pageId}/comments/${commentId}`,
    {
      withCredentials: true,
    }
  );
}

/**
 * PATCH /channel/{identifier}/schedule-notice
 * 채널의 일정 공지 업데이트
 */
export async function updateChannelScheduleNotice(
  identifier: string,
  scheduleNotice: string | null
): Promise<Channel> {
  const response = await apiClient.patch<Channel>(
    `/channel/${identifier}/schedule-notice`,
    { scheduleNotice },
    {
      withCredentials: true,
    }
  );
  return response.data;
}

// ────────────────────────────────────────────────────────────────────────────
// Global profile (meloming.gg opt-in)
// ────────────────────────────────────────────────────────────────────────────

export interface ChannelGlobalProfile {
  channelId: number;
  globalEnabled: boolean;
  globalName: string | null;
  globalDescription: string | null;
  globalProfileImageUrl: string | null;
  primaryLocale: string | null;
}

export interface ChannelGlobalProfileUpsertBody {
  globalEnabled?: boolean;
  globalName?: string | null;
  globalDescription?: string | null;
  globalProfileImageUrl?: string | null;
  primaryLocale?: string | null;
}

/** GET /channel/{channelId}/global-profile (공개) */
export async function getChannelGlobalProfile(
  channelId: number
): Promise<ChannelGlobalProfile> {
  const response = await apiClient.get<ChannelGlobalProfile>(
    `/channel/${channelId}/global-profile`
  );
  return response.data;
}

/** PATCH /channel/{channelId}/global-profile (소유자/매니저 settings) */
export async function patchChannelGlobalProfile(
  channelId: number,
  body: ChannelGlobalProfileUpsertBody
): Promise<ChannelGlobalProfile> {
  const response = await apiClient.patch<ChannelGlobalProfile>(
    `/channel/${channelId}/global-profile`,
    body,
    { withCredentials: true }
  );
  return response.data;
}

/**
 * GET /channel/{identifier}/guestbook-settings
 * 채널의 방명록 설정 조회
 */
export async function getChannelGuestbookSettings(
  identifier: string
): Promise<{ guestbookEnabled: boolean }> {
  const response = await apiClient.get<{ guestbookEnabled: boolean }>(
    `/channel/${identifier}/guestbook-settings`
  );
  return response.data;
}

/**
 * PATCH /channel/{identifier}/guestbook-settings
 * 채널의 방명록 설정 업데이트
 */
export async function updateChannelGuestbookSettings(
  identifier: string,
  guestbookEnabled: boolean
): Promise<{ guestbookEnabled: boolean; message: string }> {
  const response = await apiClient.patch<{
    guestbookEnabled: boolean;
    message: string;
  }>(
    `/channel/${identifier}/guestbook-settings`,
    { guestbookEnabled },
    {
      withCredentials: true,
    }
  );
  return response.data;
}

/**
 * GET /channel/{identifier}/feature-settings
 * 채널 공개 메뉴의 기능 노출/이름/순서 설정 조회
 */
export async function getChannelFeatureSettings(
  identifier: string
): Promise<ChannelFeatureSettings> {
  const response = await apiClient.get<ChannelFeatureSettings>(
    `/channel/${identifier}/feature-settings`
  );
  return response.data;
}

/**
 * PUT /channel/{identifier}/feature-settings
 * 채널 공개 메뉴의 기능 노출/이름/순서 설정 저장
 */
export async function updateChannelFeatureSettings(
  identifier: string,
  settings: ChannelFeatureSettingsUpdate
): Promise<ChannelFeatureSettings> {
  const response = await apiClient.put<ChannelFeatureSettings>(
    `/channel/${identifier}/feature-settings`,
    settings,
    {
      withCredentials: true,
    }
  );
  return response.data;
}

/**
 * GET /channel/{identifier}/musicbook-settings
 * 채널 노래책 표시/필터 설정 조회
 */
export async function getChannelMusicbookSettings(
  identifier: string
): Promise<ChannelMusicbookSettings> {
  const response = await apiClient.get<ChannelMusicbookSettings>(
    `/channel/${identifier}/musicbook-settings`
  );
  return response.data;
}

/**
 * PUT /channel/{identifier}/musicbook-settings
 * 채널 노래책 표시/필터 설정 저장
 */
export async function updateChannelMusicbookSettings(
  identifier: string,
  settings: ChannelMusicbookSettingsUpdate
): Promise<ChannelMusicbookSettings> {
  const response = await apiClient.put<ChannelMusicbookSettings>(
    `/channel/${identifier}/musicbook-settings`,
    settings,
    {
      withCredentials: true,
    }
  );
  return response.data;
}

/**
 * POST /channel/{identifier}/musicbook-settings/copy-difficulty-to-proficiency
 * 난이도를 숙련도로 일괄 복사
 */
export async function copyDifficultyToProficiency(
  identifier: string
): Promise<CopyDifficultyToProficiencyResponse> {
  const response = await apiClient.post<CopyDifficultyToProficiencyResponse>(
    `/channel/${identifier}/musicbook-settings/copy-difficulty-to-proficiency`,
    {},
    {
      withCredentials: true,
    }
  );
  return response.data;
}
