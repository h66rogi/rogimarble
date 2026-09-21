import { LiveConsoleContent } from '@/domains/overlay/components/live-console-content';

export default function Page() {
  const channelIdentifier = process.env.NEXT_PUBLIC_CHANNEL_ID ?? 'demo-channel';

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b bg-amber-50 px-4 py-2 text-xs text-amber-950 dark:bg-amber-950 dark:text-amber-50">
        <span>원본 리모컨 · 주루마블 연결 작업 중 · 기존 신청곡 기능 서버 미연결</span>
        <a className="shrink-0 underline underline-offset-2" href="/login">
          로그인
        </a>
      </div>
      <div className="min-h-0 flex-1">
        <LiveConsoleContent
          user={channelIdentifier}
          isPopup
          canGlobalBlock={false}
        />
      </div>
    </div>
  );
}
