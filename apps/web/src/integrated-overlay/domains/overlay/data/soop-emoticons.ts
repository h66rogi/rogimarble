// Client-side SOOP global emoticon catalog cache.
//
// SOOP does not ship an inline emote map on chat frames the way CHZZK and
// ci.me do — instead, every signature/global keyword (e.g. `/응원봉/`) is
// resolved against this static catalog. We fetch it through a same-origin
// web route (avoids CORS) once per browser session and memoise the parsed
// lookup map at module scope.

export interface SoopEmoticonEntry {
  keyword: string; // e.g. "/응원봉/"
  fileName: string; // e.g. "1.png" or "225.webp"
  imageUrl?: string; // channel signature emotes use an absolute SOOP CDN URL
  staticFileName?: string; // png fallback when fileName is animated webp
  version: number;
}

export interface SoopEmoticonCatalog {
  smallUrl: string;
  bigUrl: string;
  // keyword (with surrounding slashes) → entry
  byKeyword: Map<string, SoopEmoticonEntry>;
}

interface SoopUpstream {
  result: number;
  data?: {
    default?: { small_url?: string; big_url?: string; groups?: SoopGroup[] };
    subscribe?: { groups?: SoopGroup[] };
  };
  signature?: {
    img_path?: string;
    data?: { tier1?: SoopSignatureEntry[]; tier2?: SoopSignatureEntry[] };
  };
}

interface SoopSignatureEntry {
  title?: string;
  pc_img?: string;
  mobile_img?: string;
  black_keyword?: string;
}

interface SoopGroup {
  emoticons?: Array<{
    keyword?: string;
    fileName?: string;
    staticFileName?: string;
    isDeprecated?: boolean;
    version?: number;
  }>;
}

const catalogPromises = new Map<string, Promise<SoopEmoticonCatalog | null>>();

export function getSoopCatalog(channelId = ''): Promise<SoopEmoticonCatalog | null> {
  const cached = catalogPromises.get(channelId);
  if (cached) return cached;
  const promise = fetchAndParse(channelId).catch(() => null).then(catalog => {
    if (!catalog) catalogPromises.delete(channelId);
    return catalog;
  });
  catalogPromises.set(channelId, promise);
  return promise;
}

async function fetchAndParse(channelId: string): Promise<SoopEmoticonCatalog | null> {
  const query = channelId ? `?channelId=${encodeURIComponent(channelId)}` : '';
  const res = await fetch(`/soop-emoticons${query}`, { cache: 'force-cache' });
  if (!res.ok) return null;
  const json = (await res.json()) as SoopUpstream;
  if (!json?.data?.default) return null;

  const smallUrl = json.data.default.small_url ?? '';
  const bigUrl = json.data.default.big_url ?? '';
  const byKeyword = new Map<string, SoopEmoticonEntry>();

  const collect = (groups: SoopGroup[] | undefined): void => {
    for (const group of groups ?? []) {
      for (const entry of group.emoticons ?? []) {
        if (!entry.keyword || !entry.fileName || entry.isDeprecated) continue;
        byKeyword.set(entry.keyword, {
          keyword: entry.keyword,
          fileName: entry.fileName,
          staticFileName: entry.staticFileName,
          version: entry.version ?? 0,
        });
      }
    }
  };

  collect(json.data.default.groups);
  collect(json.data.subscribe?.groups);

  const signatureBase = json.signature?.img_path ?? '';
  if (/^https:\/\/(?:static\.file\.sooplive\.com|static\.file\.afreecatv\.com)\//.test(signatureBase)) {
    for (const entry of [...(json.signature?.data?.tier1 ?? []), ...(json.signature?.data?.tier2 ?? [])]) {
      if (!entry.title || !entry.pc_img || entry.black_keyword === 'Y') continue;
      if (!/^[\p{L}\p{N}_]+$/u.test(entry.title) || !/^[\w./-]+$/.test(entry.pc_img) || entry.pc_img.includes('..')) continue;
      byKeyword.set(`/${entry.title}/`, {
        keyword: `/${entry.title}/`, fileName: entry.pc_img, imageUrl: signatureBase + entry.pc_img, version: 0,
      });
    }
  }

  return { smallUrl, bigUrl, byKeyword };
}

// `code` is the bare token (without slashes); the catalog is keyed by the
// full `/code/` form so we wrap before lookup.
export function resolveSoopEmote(
  catalog: SoopEmoticonCatalog,
  code: string,
): { url: string; animated: boolean } | null {
  const entry = catalog.byKeyword.get(`/${code}/`);
  if (!entry) return null;
  const url = entry.imageUrl ?? `${catalog.smallUrl}${entry.fileName}?v=${entry.version}`;
  const animated = entry.fileName.endsWith('.webp');
  return { url, animated };
}
