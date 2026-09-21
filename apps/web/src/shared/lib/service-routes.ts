export type ServiceId =
  | "portal"
  | "notifications"
  | "rental"
  | "search"
  | "commission"
  | "store"
  | "musicbook"
  | "hotclip"
  | "sync"
  | "content"
  | "explore"
  | "news"
  | "recruit"
  | "ranking"
  | "gift"
  | "voice"
  | "account"
  | "support"
  | "catalog"
  | "policy"
  | "id"
  | "pay"
  | "checkout";

export type ServiceLink = {
  id: ServiceId;
  label: string;
  href: string;
};

export function getDefaultBase(service: ServiceId, _envHost?: string) {
  return `/unavailable/imported-service/${encodeURIComponent(service)}`;
}

/** Imported signature retained; links stay on a local unavailable route. */
export function melomingUrl(subdomain: string, envHost?: string): string {
  void envHost;
  return `/unavailable/imported-service/${encodeURIComponent(subdomain)}`;
}

function commissionArtistRegistrationRoute(returnTo?: string): string {
  const query = returnTo
    ? `?returnTo=${encodeURIComponent(returnTo)}`
    : "";
  return `${getDefaultBase("commission")}/become-artist${query}`;
}

export const routes = {
  portal: {
    home: () => getDefaultBase("portal"),
  },
  notifications: {
    home: () => getDefaultBase("notifications"),
  },
  search: {
    home: () => getDefaultBase("search"),
  },
  rental: {
    home: () => getDefaultBase("rental"),
    orders: () => `${getDefaultBase("rental")}/orders`,
    mypage: () => `${getDefaultBase("rental")}/mypage`,
    mypageOrders: () => `${getDefaultBase("rental")}/mypage/orders`,
    mypageOrder: (orderId: string | number) =>
      `${getDefaultBase("rental")}/mypage/orders/${encodeURIComponent(String(orderId))}`,
    mypageAddresses: () => `${getDefaultBase("rental")}/mypage/addresses`,
    mypageBilling: () => `${getDefaultBase("rental")}/mypage/billing`,
    mypageReviews: () => `${getDefaultBase("rental")}/mypage/reviews`,
    checkout: () => `${getDefaultBase("rental")}/checkout`,
    policy: () => `${getDefaultBase("rental")}/policy`,
  },
  gift: {
    home: () => getDefaultBase("gift"),
    store: () => getDefaultBase("store"),
    anongift: () => getDefaultBase("gift"),
    orders: () => `${melomingUrl("gift")}/orders`,
    search: () => `${getDefaultBase("gift")}/search`,
    settings: () => `${getDefaultBase("gift")}/settings`,
    cart: () => `${getDefaultBase("store")}/cart`,
    checkout: () => `${getDefaultBase("store")}/checkout`,
    wishlist: () => `${getDefaultBase("store")}/wishlist`,
  },
  content: {
    home: () => getDefaultBase("content"),
    detail: (contentId: string | number) =>
      `${getDefaultBase("content")}/${encodeURIComponent(String(contentId))}`,
    create: () => `${getDefaultBase("content")}/create`,
    theme: () => `${getDefaultBase("content")}/theme`,
    funding: () => `${getDefaultBase("content")}/content-funding`,
    promotion: () => `${getDefaultBase("content")}/promotion`,
    annualPromotion: () => `${getDefaultBase("content")}/promotion/pro-annual`,
  },
  explore: {
    home: () => `${getDefaultBase("explore")}/explore`,
    channel: () => `${getDefaultBase("explore")}/explore/channel`,
    ranking: () => `${getDefaultBase("explore")}/explore/ranking`,
    liveSession: () => `${getDefaultBase("explore")}/explore/live-session`,
    ambassador: () => `${getDefaultBase("explore")}/explore/ambassador`,
    founders: () => `${getDefaultBase("explore")}/explore/founders`,
  },
  recruit: {
    home: () => getDefaultBase("recruit"),
    detail: (postId: string | number) =>
      `${getDefaultBase("recruit")}/${encodeURIComponent(String(postId))}`,
  },
  ranking: {
    home: () => getDefaultBase("ranking"),
  },
  voice: {
    home: () => getDefaultBase("voice"),
  },
  account: {
    home: () => getDefaultBase("account"),
    addresses: (returnTo?: string) => {
      const query = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : "";
      return `${getDefaultBase("pay")}/addresses${query}`;
    },
    billingMethods: (returnTo?: string) => {
      const query = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : "";
      return `${getDefaultBase("pay")}/subscription-payment-methods${query}`;
    },
    identityVerification: (returnTo?: string) => {
      const query = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : "";
      return `${getDefaultBase("id")}/account/platforms${query}`;
    },
    platformVerification: (returnTo?: string) => {
      const query = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : "";
      return `${getDefaultBase("id")}/account/platforms${query}`;
    },
    channelVerification: (returnTo?: string) => {
      const query = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : "";
      return `${getDefaultBase("id")}/account/platforms${query}`;
    },
    login: (returnTo?: string) => {
      const base = getDefaultBase("id");
      const query = returnTo ? `?from=${encodeURIComponent(returnTo)}` : "";
      return `${base}/auth/login${query}`;
    },
  },
  id: {
    home: () => getDefaultBase("id"),
    login: (returnTo?: string) => {
      const query = returnTo ? `?from=${encodeURIComponent(returnTo)}` : "";
      return `${getDefaultBase("id")}/auth/login${query}`;
    },
    join: (returnTo?: string) => {
      const query = returnTo ? `?from=${encodeURIComponent(returnTo)}` : "";
      return `${getDefaultBase("id")}/auth/join${query}`;
    },
    forgotPassword: (returnTo?: string) => {
      const query = returnTo ? `?from=${encodeURIComponent(returnTo)}` : "";
      return `${getDefaultBase("id")}/auth/forgot-password${query}`;
    },
    // 통합 ID 앱 계정(마이 어카운트) 홈 — 닉네임/프로필 클릭 목적지.
    account: () => `${getDefaultBase("id")}/account`,
    // 통합 ID 앱 프로필 사진 수정 페이지 — 아바타 클릭 목적지.
    accountProfileImage: () => `${getDefaultBase("id")}/account/profile/image`,
  },
  pay: {
    home: () => getDefaultBase("pay"),
    orders: () => `${getDefaultBase("pay")}/orders`,
    order: (orderId: string | number) =>
      `${getDefaultBase("pay")}/orders/${encodeURIComponent(String(orderId))}`,
    payments: () => `${getDefaultBase("pay")}/payments`,
    points: () => `${getDefaultBase("pay")}/points`,
    rewards: () => `${getDefaultBase("pay")}/rewards`,
    cash: () => `${getDefaultBase("pay")}/cash`,
    coupons: () => `${getDefaultBase("pay")}/coupons`,
    billingMethods: () => `${getDefaultBase("pay")}/subscription-payment-methods`,
    addresses: () => `${getDefaultBase("pay")}/addresses`,
    membership: () => `${getDefaultBase("pay")}/pro-settings`,
  },
  checkout: {
    home: () => getDefaultBase("checkout"),
  },
  support: {
    contact: () => getDefaultBase("support"),
  },
  commission: {
    home: () => getDefaultBase("commission"),
    // 커미션 작가 등록(입점) 페이지. ID 온보딩 등 외부 플로우 복귀를 지원한다.
    artistRegistration: (returnTo?: string) =>
      commissionArtistRegistrationRoute(returnTo),
    // 기존 호출부 호환 alias. `/register`는 통합 ID 회원가입 경로이므로 사용하지 않는다.
    register: (returnTo?: string) => commissionArtistRegistrationRoute(returnTo),
    // 커미션 작가 채널 페이지 (channelUrl = CommissionArtist.channelUrl).
    artistChannel: (channelUrl: string) =>
      `${getDefaultBase("commission")}/artists/${encodeURIComponent(channelUrl)}`,
  },
  policy: {
    // Imported policy destination is intentionally unavailable.
    // (기존 Notion 링크 대체. 분기 불가 컨텍스트는 prod policy 주소를 가정)
    terms: () => `${getDefaultBase("policy")}/terms`,
    privacy: () => `${getDefaultBase("policy")}/privacy`,
    paidService: () => `${getDefaultBase("policy")}/paid-service`,
    right: () => `${getDefaultBase("policy")}/right`,
    promotion: () => `${getDefaultBase("policy")}/promotion`,
    commissionTerms: () => `${getDefaultBase("policy")}/commission-terms`,
  },
};

export function getServiceLinks(): ServiceLink[] {
  return [
    { id: "portal", label: "홈", href: routes.portal.home() },
    { id: "notifications", label: "알림센터", href: routes.notifications.home() },
    { id: "rental", label: "렌탈", href: routes.rental.home() },
    { id: "store", label: "스토어", href: getDefaultBase("store") },
    { id: "commission", label: "커미션", href: getDefaultBase("commission") },
    { id: "musicbook", label: "노래책", href: getDefaultBase("musicbook") },
    { id: "gift", label: "선물하기", href: getDefaultBase("gift") },
    { id: "ranking", label: "랭킹", href: getDefaultBase("ranking") },
    { id: "voice", label: "보이스커미션", href: getDefaultBase("voice") },
  ];
}

const SERVICE_LABELS: Record<ServiceId, string> = {
  portal: "홈",
  notifications: "알림센터",
  rental: "렌탈",
  search: "검색",
  commission: "커미션",
  store: "스토어",
  musicbook: "노래책",
  hotclip: "핫클립",
  sync: "싱크",
  content: "뻐꾸기 시트",
  explore: "탐색",
  news: "뉴스",
  recruit: "구인구직",
  ranking: "랭킹",
  gift: "선물하기",
  voice: "보이스커미션",
  account: "마이페이지",
  support: "고객센터",
  catalog: "전체 서비스",
  policy: "약관 및 정책",
  id: "통합 ID",
  pay: "페이",
  checkout: "결제",
};

export function getServiceLabel(id: ServiceId): string {
  return SERVICE_LABELS[id];
}

export type ServiceCategory = {
  title: string;
  links: ServiceLink[];
};

/** All Meloming services grouped by field — for the global "전체 서비스" launcher. */
export function getServiceCategories(): ServiceCategory[] {
  return [
    {
      title: "멜로밍",
      links: [{ id: "portal", label: "멜로밍 홈", href: routes.portal.home() }],
    },
    {
      title: "음악",
      links: [
        { id: "musicbook", label: "노래책", href: getDefaultBase("musicbook") },
        { id: "hotclip", label: "핫클립", href: getDefaultBase("hotclip") },
        { id: "sync", label: "싱크", href: getDefaultBase("sync") },
      ],
    },
    {
      title: "콘텐츠",
      links: [
        { id: "content", label: "뻐꾸기 시트", href: getDefaultBase("content") },
        { id: "news", label: "뉴스", href: getDefaultBase("news") },
        { id: "recruit", label: "구인구직", href: getDefaultBase("recruit") },
        { id: "ranking", label: "랭킹", href: getDefaultBase("ranking") },
        { id: "explore", label: "탐색", href: getDefaultBase("explore") },
      ],
    },
    {
      title: "쇼핑",
      links: [
        { id: "store", label: "스토어", href: getDefaultBase("store") },
        { id: "gift", label: "선물하기", href: getDefaultBase("gift") },
        { id: "commission", label: "커미션", href: getDefaultBase("commission") },
        { id: "rental", label: "렌탈", href: getDefaultBase("rental") },
        { id: "voice", label: "보이스커미션", href: getDefaultBase("voice") },
      ],
    },
    {
      title: "기타",
      links: [
        { id: "notifications", label: "알림센터", href: routes.notifications.home() },
        { id: "account", label: "마이페이지", href: routes.account.home() },
        { id: "pay", label: "페이", href: routes.pay.home() },
      ],
    },
  ];
}

export function getRentalServiceUrl(): string {
  return getDefaultBase("rental");
}
