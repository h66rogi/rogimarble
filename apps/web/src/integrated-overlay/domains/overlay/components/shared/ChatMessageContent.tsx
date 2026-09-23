'use client';

import { useEffect, useState, type CSSProperties, type ReactElement } from 'react';

import type { ChatEmoteToken, ChatPlatform } from '../../types/chat';
import {
  getSoopCatalog,
  resolveSoopEmote,
  type SoopEmoticonCatalog,
} from '../../data/soop-emoticons';

// Per-platform regex for re-locating emote tokens in the message body.
// We deliberately re-scan the text on the client instead of trusting the
// `start`/`end` byte offsets shipped from chat-service: those offsets are
// computed against UTF-8 byte indexes (Go `string` semantics) and would
// not line up with JavaScript's UTF-16 string slicing for any message
// containing CJK characters before a token.
const TOKEN_REGEX_BY_PLATFORM: Record<ChatPlatform, RegExp> = {
  chzzk: /\{:([^:}]+):\}/g,
  cime: /:([A-Za-z0-9_\-]+):/g,
  soop: /\/([\p{L}\p{N}_]+)\//gu,
  // meloming: IVS Chat 은 inline emote 없음. never-match regex 로 plain text 처리.
  meloming: /(?!)/g,
};

interface ChatMessageContentProps {
  message: string;
  platform: ChatPlatform;
  channelId?: string;
  emotes?: ChatEmoteToken[];
  /** Inline image height — themes pass a value matching their text size. */
  emoteHeight?: number;
  /** Large SOOP OGQ image height. */
  ogqHeight?: number;
  className?: string;
  style?: CSSProperties;
}

type Segment =
  | { kind: 'text'; text: string }
  | {
      kind: 'emote';
      code: string;
      url: string;
      alt: string;
      animated: boolean;
    };

export function ChatMessageContent({
  message,
  platform,
  channelId,
  emotes,
  emoteHeight = 22,
  ogqHeight = emoteHeight * 6,
  className,
  style,
}: ChatMessageContentProps): ReactElement {
  const soopCatalog = useSoopCatalog(platform === 'soop', channelId);

  const segments = buildSegments(message, platform, emotes, soopCatalog);
  const ogqEmotes = platform === 'soop' ? (emotes ?? []).filter(e => e.source === 'soop_ogq' && e.imageUrl) : [];

  return (
    <span className={className} style={style}>
      {segments.map((seg, i) =>
        seg.kind === 'text' ? (
          <span key={i}>{seg.text}</span>
        ) : (
          // Inline emote: small (~22px) image directly in a chat line. The
          // next/image overhead (placeholder, blur, layout shift handling)
          // gives no benefit here and adds a layout cost per token, of
          // which there can be many in a single message. Plain <img> is
          // intentional.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={seg.url}
            alt={seg.alt}
            loading="lazy"
            decoding="async"
            draggable={false}
            style={{
              display: 'inline-block',
              verticalAlign: 'middle',
              height: emoteHeight,
              width: 'auto',
            }}
          />
        ),
      )}
      {ogqEmotes.map((emote, i) => (
        // OGQ is a separate SOOP packet and appears below any accompanying text.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`ogq-${i}`}
          src={emote.imageUrl}
          alt="OGQ 이모티콘"
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={event => {
            const image = event.currentTarget;
            if (image.src.endsWith('.webp')) image.src = image.src.replace(/\.webp$/, '.png');
          }}
          style={{ display: 'block', width: 'auto', height: ogqHeight, maxWidth: '100%', objectFit: 'contain' }}
        />
      ))}
    </span>
  );
}

// Lazy-load the SOOP catalog only when at least one SOOP message renders.
function useSoopCatalog(enabled: boolean, channelId?: string): SoopEmoticonCatalog | null {
  const key = channelId ?? '';
  const [loaded, setLoaded] = useState<{ key: string; catalog: SoopEmoticonCatalog | null } | null>(null);
  useEffect(() => {
    if (!enabled || loaded?.key === key) return;
    let cancelled = false;
    void getSoopCatalog(key).then((catalog) => {
      if (!cancelled) setLoaded({ key, catalog });
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, key, loaded]);
  return loaded?.key === key ? loaded.catalog : null;
}

export function buildSegments(
  message: string,
  platform: ChatPlatform,
  emotes: ChatEmoteToken[] | undefined,
  soopCatalog: SoopEmoticonCatalog | null,
): Segment[] {
  if (!message) return [{ kind: 'text', text: '' }];

  // Inline map shipped by chat-service (chzzk/cime). Falsy URLs are dropped
  // so we can fall back to plain text when the upstream did not provide a
  // mapping for that token.
  const inlineMap = new Map<string, ChatEmoteToken>();
  for (const e of emotes ?? []) {
    if (e.imageUrl && !inlineMap.has(e.code)) inlineMap.set(e.code, e);
  }

  const regex = TOKEN_REGEX_BY_PLATFORM[platform];
  if (!regex) return [{ kind: 'text', text: message }];

  const segments: Segment[] = [];
  let cursor = 0;
  for (const match of message.matchAll(regex)) {
    const matchStart = match.index ?? 0;
    const matchEnd = matchStart + match[0].length;
    const code = match[1];

    const resolved = resolveCode(code, platform, inlineMap, soopCatalog);
    if (!resolved) continue;

    if (matchStart > cursor) {
      segments.push({ kind: 'text', text: message.slice(cursor, matchStart) });
    }
    segments.push({
      kind: 'emote',
      code,
      url: resolved.url,
      alt: match[0],
      animated: resolved.animated,
    });
    cursor = matchEnd;
  }
  if (cursor < message.length) {
    segments.push({ kind: 'text', text: message.slice(cursor) });
  }
  if (segments.length === 0) return [{ kind: 'text', text: message }];
  return segments;
}

function resolveCode(
  code: string,
  platform: ChatPlatform,
  inlineMap: Map<string, ChatEmoteToken>,
  soopCatalog: SoopEmoticonCatalog | null,
): { url: string; animated: boolean } | null {
  const inline = inlineMap.get(code);
  if (inline?.imageUrl) {
    return { url: inline.imageUrl, animated: inline.animated ?? false };
  }
  if (platform === 'soop' && soopCatalog) {
    return resolveSoopEmote(soopCatalog, code);
  }
  return null;
}
