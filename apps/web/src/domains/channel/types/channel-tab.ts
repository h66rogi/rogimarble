import { melomingUrl } from "@/shared/lib/service-routes";
/**
 * 채널 페이지의 탭 타입 정의
 */
export type ChannelTab =
  | "home"
  | "live"
  | "musicbook"
  | "setlist"
  | "ranking"
  | "schedule"
  | "wardrobe"
  | "clip"
  | "board"
  | "guestbook"
  | "info"
  | "gift"
  | "upbo"
  | "voice"
  | "homework-song"
  | "content";

/**
 * 각 탭의 설정 정보
 */
export interface TabConfig {
  title: string;
  path: string;
  tabName: ChannelTab;
  isNew?: boolean;
  /** 탭 설명 — 신규 레이아웃 SectionHeaderV3 타이틀 옆 i 버튼 팝오버로 노출 */
  description?: string;
  /** 외부 링크 여부 (새 탭으로 열림, 내부 라우팅 아님) */
  isExternal?: boolean;
  /** 내부 라우트지만 채널 sub-path 가 아닌 별도 절대 경로 (예: /anongift/streamer/{webPath}) */
  absolutePathBuilder?: (webPath: string) => string;
  /** feature flag 게이팅 — 활성화될 때만 노출 */
  featureFlag?: string;
}

export interface ChannelFeatureSetting {
  key: ChannelTab;
  label: string;
  defaultLabel: string;
  isEnabled: boolean;
  order: number;
}

export interface ChannelFeatureSettings {
  items: ChannelFeatureSetting[];
  customItems?: ChannelCustomMenuItem[];
}

export interface ChannelMusicbookSettings {
  useProficiencyAsPrimary: boolean;
  hasExplicitUseProficiencyAsPrimary: boolean;
  canEnableProficiencyAsPrimary: boolean;
  totalSongs: number;
  songsMissingProficiency: number;
}

export type ChannelMusicbookSettingsUpdate = {
  useProficiencyAsPrimary: boolean;
};

export type CopyDifficultyToProficiencyResponse =
  ChannelMusicbookSettings & {
    updatedCount: number;
  };

export type ChannelCustomMenuItemType = "page" | "board";

export type ChannelCustomMenuIconName = string;

export interface ChannelCustomMenuItem {
  id: string;
  type: ChannelCustomMenuItemType;
  path: string;
  label: string;
  defaultLabel: string;
  iconName?: ChannelCustomMenuIconName;
  isEnabled: boolean;
  order: number;
  contentHtml?: string;
  commentsEnabled?: boolean;
  boardId?: number;
  boardName?: string | null;
}

export interface ChannelCustomPageCommentAuthor {
  id: number;
  nickname: string;
  profileImageUrl: string | null;
}

export interface ChannelCustomPageComment {
  id: string;
  content: string;
  author: ChannelCustomPageCommentAuthor;
  createdAt: string;
  updatedAt: string;
  isEdited: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export interface ChannelCustomPageCommentsResponse {
  commentsEnabled: boolean;
  items: ChannelCustomPageComment[];
}

export interface ChannelCustomPageCommentBody {
  content: string;
}

export type ChannelFeatureSettingsUpdate = {
  items: Array<
    Pick<ChannelFeatureSetting, "key" | "label" | "isEnabled" | "order">
  >;
  customItems?: Array<
    Pick<
      ChannelCustomMenuItem,
      | "id"
      | "type"
      | "path"
      | "label"
      | "iconName"
      | "isEnabled"
      | "order"
      | "contentHtml"
      | "commentsEnabled"
      | "boardId"
    >
  >;
};

export type ConfiguredTabItem = TabConfig & {
  defaultTitle: string;
  isEnabled: boolean;
  order: number;
};

export type ChannelTabAvailability = {
  voiceCommissionActive?: boolean;
  homeworkSongActive?: boolean;
};

/**
 * 탭 설정 상수
 */
export const TAB_CONFIG: Record<ChannelTab, TabConfig> = {
  home: { title: "홈", path: "", tabName: "home", isNew: false },
  live: {
    title: "라이브",
    path: "live",
    tabName: "live",
    isNew: true,
    description: "채널의 현재 라이브와 멜로밍 기능을 함께 볼 수 있습니다.",
    featureFlag: "liveStreaming",
  },
  voice: {
    title: "보이스커미션",
    path: "voice",
    tabName: "voice",
    isNew: true,
    description: "스트리머가 열어둔 보이스커미션 상품을 확인하고 주문합니다.",
  },
  "homework-song": {
    title: "숙제곡",
    path: "homework-song",
    tabName: "homework-song",
    isNew: true,
    description: "스트리머에게 연습하길 바라는 곡을 신청합니다.",
  },
  musicbook: {
    title: "노래책",
    path: "musicbook",
    tabName: "musicbook",
    isNew: false,
    description: "채널이 부를 수 있는 곡과 신청 가능한 곡을 모아 봅니다.",
  },
  setlist: {
    title: "셋리스트",
    path: "setlist",
    tabName: "setlist",
    isNew: false,
    description: "방송에서 재생됐던 곡을 세션별로 다시 볼 수 있습니다.",
  },
  ranking: {
    title: "랭킹",
    path: "ranking",
    tabName: "ranking",
    isNew: false,
    description: "이 채널의 채팅 워드클라우드와 방송 히스토리를 미리 보세요.",
  },
  schedule: {
    title: "캘린더",
    path: "schedule",
    tabName: "schedule",
    isNew: true,
    description: "방송 일정 · 방송 기록 · 노래 방송 · 기념일을 한눈에",
  },
  wardrobe: {
    title: "옷장",
    path: "wardrobe",
    tabName: "wardrobe",
    isNew: true,
    description: "버추얼 스트리머의 의상, 헤어 등 이미지를 모아 봅니다.",
  },
  clip: {
    title: "노래클립",
    path: "clip",
    tabName: "clip",
    isNew: false,
    description: "이 채널의 노래클립과 업로드 클립을 모아 봅니다.",
  },
  board: {
    title: "게시판",
    path: "board",
    tabName: "board",
    isNew: false,
    description: "채널 공지, 자유게시판, 방송후기 등 채널별 게시판입니다.",
  },
  guestbook: {
    title: "방명록",
    path: "guestbook",
    tabName: "guestbook",
    isNew: false,
    description: "채널에 짧은 메시지를 남기고 방문자 반응을 확인합니다.",
  },
  info: {
    title: "정보",
    path: "info",
    tabName: "info",
    isNew: false,
    description: "채널 소개, 링크, 활동 정보를 확인합니다.",
  },
  gift: {
    title: "선물하기",
    path: "gift",
    tabName: "gift",
    isNew: true,
    description: "주소 노출 없이 안전하게 스트리머나 팬에게 선물을 보냅니다.",
    featureFlag: "anongift-channel-menu",
  },
  upbo: {
    title: "룰렛 업보",
    path: "upbo",
    tabName: "upbo",
    isNew: true,
    description: "룰렛으로 얻은 보상 보유량과 사용 이력을 확인합니다.",
  },
  content: {
    title: "콘텐츠",
    path: "content",
    tabName: "content",
    isNew: true,
    description:
      "채널과 연결된 주최 콘텐츠와 참가 가능한 콘텐츠 모집을 확인합니다.",
  },
} as const;

/**
 * 탭 설정 배열
 */
export const TAB_ITEMS: ReadonlyArray<TabConfig> = [
  TAB_CONFIG.home,
  TAB_CONFIG.board,
  TAB_CONFIG.musicbook,
  TAB_CONFIG.schedule,
  TAB_CONFIG.gift,
  TAB_CONFIG.clip,
  TAB_CONFIG.upbo,
  TAB_CONFIG.ranking,
  TAB_CONFIG.content,
  TAB_CONFIG.setlist,
  TAB_CONFIG.voice,
  TAB_CONFIG["homework-song"],
  TAB_CONFIG.guestbook,
  TAB_CONFIG.info,
  TAB_CONFIG.wardrobe,
] as const;

const DEFAULT_CHANNEL_TAB_ORDER: Record<ChannelTab, number> = {
  home: 0,
  board: 1,
  musicbook: 2,
  schedule: 3,
  gift: 4,
  clip: 6,
  upbo: 7,
  ranking: 8,
  content: 9,
  setlist: 10,
  voice: 11,
  "homework-song": 12,
  guestbook: 13,
  info: 14,
  wardrobe: 15,
  live: 16,
};

const DEFAULT_DISABLED_CHANNEL_TABS = new Set<ChannelTab>(["live"]);

export const DEFAULT_CHANNEL_FEATURE_SETTINGS: ChannelFeatureSettings = {
  items: TAB_ITEMS.map((item) => ({
    key: item.tabName,
    label: item.title,
    defaultLabel: item.title,
    isEnabled: !DEFAULT_DISABLED_CHANNEL_TABS.has(item.tabName),
    order: DEFAULT_CHANNEL_TAB_ORDER[item.tabName],
  })),
  customItems: [
    {
      id: "rules",
      type: "page",
      path: "rules",
      label: "방송규칙",
      defaultLabel: "방송규칙",
      iconName: "ShieldCheck",
      isEnabled: true,
      order: 5,
      contentHtml:
        "<h2>방송규칙</h2><p>아직 방송규칙이 작성되지 않았습니다.</p>",
      commentsEnabled: false,
    },
  ],
};

export function getChannelFeatureSetting(
  settings: ChannelFeatureSettings | null | undefined,
  tab: ChannelTab
): ChannelFeatureSetting {
  const fallback =
    DEFAULT_CHANNEL_FEATURE_SETTINGS.items.find((item) => item.key === tab) ??
    DEFAULT_CHANNEL_FEATURE_SETTINGS.items[0];
  const stored = settings?.items.find((item) => item.key === tab);

  return {
    ...fallback,
    ...stored,
    label: stored?.label?.trim() || fallback.defaultLabel,
    defaultLabel: fallback.defaultLabel,
  };
}

export function isChannelTabEnabled(
  settings: ChannelFeatureSettings | null | undefined,
  tab: ChannelTab,
  availability?: ChannelTabAvailability | null
): boolean {
  if (isChannelTabForceEnabled(tab, availability)) return true;
  return getChannelFeatureSetting(settings, tab).isEnabled;
}

export function getConfiguredTabItems(
  settings: ChannelFeatureSettings | null | undefined,
  availability?: ChannelTabAvailability | null
): ConfiguredTabItem[] {
  const defaultOrder = new Map(
    DEFAULT_CHANNEL_FEATURE_SETTINGS.items.map((item, index) => [
      item.key,
      index,
    ])
  );

  return TAB_ITEMS.map((item) => {
    const feature = getChannelFeatureSetting(settings, item.tabName);
    const isForceEnabled = isChannelTabForceEnabled(item.tabName, availability);
    return {
      ...item,
      title: feature.label,
      defaultTitle: feature.defaultLabel,
      isEnabled: feature.isEnabled || isForceEnabled,
      order: feature.order,
    };
  })
    .filter((item) => item.isEnabled)
    .sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return (
        (defaultOrder.get(a.tabName) ?? 0) - (defaultOrder.get(b.tabName) ?? 0)
      );
    });
}

export function getConfiguredCustomMenuItems(
  settings: ChannelFeatureSettings | null | undefined
): ChannelCustomMenuItem[] {
  const items =
    settings?.customItems ?? DEFAULT_CHANNEL_FEATURE_SETTINGS.customItems ?? [];

  return items
    .map((item, index) => ({
      ...item,
      label: item.label?.trim() || item.defaultLabel || "페이지",
      defaultLabel: item.defaultLabel || item.label || "페이지",
      order: Number.isInteger(item.order) ? item.order : TAB_ITEMS.length + index,
    }))
    .filter((item) => item.isEnabled)
    .sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.id.localeCompare(b.id);
    });
}

export function getAllConfiguredChannelMenuItems(
  settings: ChannelFeatureSettings | null | undefined,
  availability?: ChannelTabAvailability | null
): Array<ConfiguredTabItem | ChannelCustomMenuItem> {
  return [
    ...getConfiguredTabItems(settings, availability),
    ...getConfiguredCustomMenuItems(settings),
  ].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return "tabName" in a ? -1 : 1;
  });
}

function isChannelTabForceEnabled(
  tab: ChannelTab,
  availability?: ChannelTabAvailability | null
): boolean {
  return tab === "voice" && availability?.voiceCommissionActive === true;
}

export function getCustomMenuPath(webPath: string, item: ChannelCustomMenuItem): string {
  return `/channel/${webPath}/${item.path}`;
}

export function getCustomMenuItemFromPath(
  settings: ChannelFeatureSettings | null | undefined,
  pathname: string
): ChannelCustomMenuItem | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length < 3 || parts[0] !== "channel") return null;
  const customPath = parts.slice(2).join("/");
  return (
    getConfiguredCustomMenuItems(settings).find(
      (item) => item.path === customPath
    ) ?? null
  );
}

/**
 * 현재 호스트 기반으로 ranking-front 기본 URL 반환
 */
export function getRankingBaseUrl(): string {
  return melomingUrl("ranking");
}

/**
 * platformUrl에서 플랫폼 종류와 채널 ID를 추출
 */
export function parsePlatformUrl(
  platformUrl: string
): { platform: string; channelId: string } | null {
  try {
    const url = new URL(platformUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    const id = parts[parts.length - 1];
    if (!id) return null;
    if (
      url.hostname.includes("sooplive.co.kr") ||
      url.hostname.includes("afreecatv.com")
    ) {
      return { platform: "soop", channelId: id };
    }
    if (url.hostname.includes("chzzk.naver.com")) {
      return { platform: "chzzk", channelId: id };
    }
    if (url.hostname.includes("cime") || url.hostname.includes("ci.me")) {
      return { platform: "cime", channelId: id.replace(/^@/, "") };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 채널의 platformUrl에서 랭킹 채널 상세 URL 생성
 * platformUrl이 없거나 파싱 실패 시 랭킹 홈으로 폴백
 */
export function getChannelRankingUrl(
  platformUrl: string | undefined | null
): string {
  const base = getRankingBaseUrl();
  if (!platformUrl) return base;
  const parsed = parsePlatformUrl(platformUrl);
  if (!parsed) return base;
  return `${base}/channels/${parsed.platform}/${parsed.channelId}`;
}

/**
 * 경로에서 탭 추출
 * @param pathname - 현재 경로 (예: /channel/username/musicbook)
 * @returns ChannelTab 또는 'home' (기본값)
 */
export function getTabFromPath(pathname: string): ChannelTab {
  // pathname 형식: /channel/{user}/{tab?}
  const parts = pathname.split("/").filter(Boolean);

  if (parts.length < 2 || parts[0] !== "channel") {
    return "home";
  }

  // /channel/{user} 형태면 home
  if (parts.length === 2) {
    return "home";
  }

  // /channel/{user}/{tab} 형태
  const tabPath = parts[2];

  // tabPath가 유효한 내부 탭인지 확인 (외부 탭 제외)
  const validTab = Object.values(TAB_CONFIG).find(
    (config) => !config.isExternal && config.path === tabPath
  );

  return validTab?.tabName ?? "home";
}

/**
 * 탭에서 경로 생성
 * @param webPath - 채널 webPath
 * @param tab - 탭 이름
 * @returns 전체 경로
 */
export function getPathFromTab(webPath: string, tab: ChannelTab): string {
  const config = TAB_CONFIG[tab];
  const basePath = `/channel/${webPath}`;

  if (!config.path) {
    return basePath;
  }

  return `${basePath}/${config.path}`;
}

/**
 * 탭의 타이틀 가져오기
 * @param tab - 탭 이름
 * @returns 탭 타이틀
 */
export function getTabTitle(tab: ChannelTab): string {
  return TAB_CONFIG[tab].title;
}

/**
 * 탭의 설명 가져오기 (없으면 undefined).
 * 신규 레이아웃 SectionHeaderV3 타이틀 옆 i 버튼 팝오버에 사용.
 */
export function getTabDescription(tab: ChannelTab): string | undefined {
  return TAB_CONFIG[tab].description;
}

/**
 * 쿼리 파라미터의 tab 값을 ChannelTab으로 변환
 * 외부 탭(ranking 등)은 내부 경로가 없으므로 제외됩니다.
 * @param tabParam - ?tab= 쿼리 파라미터 값
 * @returns ChannelTab 또는 null
 */
export function parseTabParam(tabParam: string | null): ChannelTab | null {
  if (!tabParam) return null;

  const internalTabs = (Object.keys(TAB_CONFIG) as ChannelTab[]).filter(
    (name) => !TAB_CONFIG[name].isExternal
  );

  if (internalTabs.includes(tabParam as ChannelTab)) {
    return tabParam as ChannelTab;
  }

  return null;
}
