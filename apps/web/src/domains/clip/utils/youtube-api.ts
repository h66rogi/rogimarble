/**
 * YouTube IFrame Player API 로더
 * @see https://developers.google.com/youtube/iframe_api_reference
 */

// YT 타입 선언
declare global {
  interface Window {
    YT?: typeof YT;
    onYouTubeIframeAPIReady?: () => void;
  }
}

declare namespace YT {
  enum PlayerState {
    UNSTARTED = -1,
    ENDED = 0,
    PLAYING = 1,
    PAUSED = 2,
    BUFFERING = 3,
    CUED = 5,
  }

  interface PlayerEvent {
    target: Player;
    data: PlayerState;
  }

  interface PlayerOptions {
    videoId?: string;
    width?: number | string;
    height?: number | string;
    playerVars?: {
      autoplay?: 0 | 1;
      controls?: 0 | 1;
      rel?: 0 | 1;
      modestbranding?: 0 | 1;
      enablejsapi?: 0 | 1;
      origin?: string;
      fs?: 0 | 1;
      [key: string]: unknown;
    };
    events?: {
      onReady?: (event: PlayerEvent) => void;
      onStateChange?: (event: PlayerEvent) => void;
      onError?: (event: { target: Player; data: number }) => void;
    };
  }

  class Player {
    constructor(elementId: string | HTMLElement, options: PlayerOptions);
    destroy(): void;
    playVideo(): void;
    pauseVideo(): void;
    stopVideo(): void;
    getPlayerState(): PlayerState;
    getCurrentTime(): number;
    getDuration(): number;
    seekTo(seconds: number, allowSeekAhead?: boolean): void;
    setVolume(volume: number): void;
    getVolume(): number;
    mute(): void;
    unMute(): void;
    isMuted(): boolean;
  }
}

let apiLoadPromise: Promise<void> | null = null;
let isApiReady = false;

/**
 * YouTube IFrame API 스크립트 로드
 * - 이미 로드되었으면 즉시 resolve
 * - 로딩 중이면 기존 Promise 반환
 */
export function loadYouTubeApi(): Promise<void> {
  return Promise.reject(new Error('YouTube 재생은 주루마블에서 아직 지원하지 않습니다.'));
}

/**
 * YouTube API가 로드되었는지 확인
 */
export function isYouTubeApiReady(): boolean {
  return isApiReady && !!window.YT?.Player;
}

/**
 * YouTube Player 생성
 */
export function createYouTubePlayer(
  elementId: string | HTMLElement,
  options: YT.PlayerOptions
): YT.Player | null {
  if (!isYouTubeApiReady()) {
    console.warn("YouTube API not loaded yet");
    return null;
  }
  return new window.YT!.Player(elementId, options);
}

export { YT };
