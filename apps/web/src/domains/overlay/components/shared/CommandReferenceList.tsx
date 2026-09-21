'use client';

import { useId, useState } from 'react';
import { ChevronDown, MessageSquare, Shield } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

export interface CommandGroupItem {
  aliases: string[];
  description: string;
  /** 비활성화 상태면 true — 꺼짐 배지 표시 + dim */
  disabled?: boolean;
  /** 비활성화 배지 문구 */
  disabledLabel?: string;
}

export interface CommandReferenceListProps {
  /** 채널이 커스텀한 신청 명령어. 기본 "!신청" */
  requestCommand?: string;
  /** 기본 접힌 상태 여부 */
  defaultCollapsed?: boolean;
  /** 제목 표시 여부. 부모가 이미 헤더 내렸으면 false */
  showTitle?: boolean;
  /** 채팅 신청 활성 여부 (신청 방법 토글과 동기화). 생략 시 켜진 것으로 간주 */
  chatRequestEnabled?: boolean;
  /** 후원 신청 활성 여부. 생략 시 켜진 것으로 간주 */
  donationRequestEnabled?: boolean;
  /** 채팅/후원 신청 항목이 비활성일 때 표시할 배지 */
  requestDisabledLabel?: string;
  className?: string;
}

function buildViewerCommands(
  requestCommand: string,
  chatEnabled: boolean,
  donationEnabled: boolean,
  disabledLabel = '꺼짐',
): CommandGroupItem[] {
  return [
    {
      aliases: [`${requestCommand} 가수 - 노래제목`],
      description: '채팅으로 신청곡 추가',
      disabled: !chatEnabled,
      disabledLabel,
    },
    {
      aliases: [`${requestCommand} 가수 - 노래제목`],
      description: '후원 메시지에 입력 · 후원과 함께 신청',
      disabled: !donationEnabled,
      disabledLabel,
    },
    {
      aliases: ['!도움말', '!도움', '!help', '!신청방법', '!how'],
      description: '신청 방법 오버레이 표시',
    },
  ];
}

const STREAMER_COMMANDS: CommandGroupItem[] = [
  {
    aliases: ['!일시정지', '!정지', '!멈춰'],
    description: '신청 일시정지',
  },
  { aliases: ['!재개'], description: '신청 재개' },
  {
    aliases: ['!다음곡', '!다음', '!스킵', '!건너뛰기'],
    description: '현재곡 종료하고 다음 곡 재생',
  },
  {
    aliases: ['!신청곡중지', '!신청곡종료', '!세션종료'],
    description: '신청곡 세션 종료',
  },
  {
    aliases: ['!노래책추가 곡명', '!추가곡 곡명', '!추가 곡명'],
    description: '곡을 노래책에 자동 추가 (스트리머 전용)',
  },
];

function CommandRow({ item }: { item: CommandGroupItem }) {
  return (
    <li
      className={cn(
        'flex flex-wrap items-baseline gap-x-2 gap-y-1 py-1.5',
        item.disabled && 'opacity-50',
      )}
    >
      <span className="flex flex-wrap gap-1">
        {item.aliases.map((alias) => (
          <code
            key={alias}
            className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono"
          >
            {alias}
          </code>
        ))}
      </span>
      <span className="text-xs text-muted-foreground">— {item.description}</span>
      {item.disabled && (
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {item.disabledLabel ?? '꺼짐'}
        </span>
      )}
    </li>
  );
}

export function CommandReferenceList({
  requestCommand = '!신청',
  defaultCollapsed = false,
  showTitle = true,
  chatRequestEnabled = true,
  donationRequestEnabled = true,
  requestDisabledLabel,
  className,
}: CommandReferenceListProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const contentId = useId();
  const viewerCommands = buildViewerCommands(
    requestCommand,
    chatRequestEnabled,
    donationRequestEnabled,
    requestDisabledLabel,
  );

  return (
    <div className={cn('w-full', className)}>
      {showTitle && (
        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          aria-expanded={!collapsed}
          aria-controls={contentId}
          className="flex w-full items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronDown
            className={cn(
              'size-3.5 transition-transform',
              collapsed ? '-rotate-90' : 'rotate-0',
            )}
          />
          <span className="font-medium">사용 가능한 명령어</span>
        </button>
      )}

      {(!showTitle || !collapsed) && (
        <div id={contentId} className={cn('space-y-4', showTitle && 'mt-3')}>
          <section>
            <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <MessageSquare className="size-3.5" />
              시청자
            </div>
            <ul className="divide-y rounded border bg-background/50 px-3 py-1">
              {viewerCommands.map((item) => (
                <CommandRow key={item.description} item={item} />
              ))}
            </ul>
          </section>

          <section>
            <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Shield className="size-3.5" />
              스트리머 / 매니저
            </div>
            <ul className="divide-y rounded border bg-background/50 px-3 py-1">
              {STREAMER_COMMANDS.map((item) => (
                <CommandRow key={item.description} item={item} />
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
