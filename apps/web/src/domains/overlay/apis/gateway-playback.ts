/**
 * Gateway Playback URL API
 *
 * YouTube 영상을 meloming-media-gateway-cdn 으로 우회시키는 백엔드
 * 엔드포인트. 백엔드가 cache 조회 + HMAC 서명 + gateway URL 조립을
 * 모두 처리한다. 브라우저는 signing secret을 알 필요 없음.
 *
 * 인증: JwtOrConsoleTokenGuard — 관리 콘솔(JWT) + 팝업 콘솔(?token=)
 * 양쪽 지원.
 */
import { apiClient } from '@/shared/lib/api-client';

export interface GatewayPlaybackResponse {
  /** gateway가 서명한 /play 또는 CloudFront cache URL */
  playbackUrl: string;
  /** signed URL 만료 시각 (ISO-8601) */
  expiresAt: string;
  title?: string;
  duration?: number;
  /** 'cached' = CloudFront/S3 경유, 'proxy' = gateway /play cold fetch */
  source: 'cached' | 'proxy';
}

/**
 * @param songId - Song.id. 있으면 backend가 CloudFront/S3 cache hit를 우선한다.
 *                 cache miss는 gateway /play가 추출과 저장을 같은 노드에서 처리한다.
 */
export async function fetchGatewayPlaybackUrl(
  sessionId: number,
  videoUrl: string,
  songId?: number | null,
): Promise<GatewayPlaybackResponse> {
  const body: { videoUrl: string; songId?: number } = { videoUrl };
  if (songId != null) body.songId = songId;
  const response = await apiClient.post<GatewayPlaybackResponse>(
    `/console-api/sessions/${sessionId}/playback-url`,
    body,
    { withCredentials: true },
  );
  return response.data;
}
