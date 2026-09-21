import { OperatingModeNotice } from '@/domains/marble/components/operating-mode-notice';
import { LiveConsoleContent } from '@/domains/overlay/components/live-console-content';

export default function Page() {
  const channelIdentifier = process.env.NEXT_PUBLIC_CHANNEL_ID ?? 'demo-channel';

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
      <OperatingModeNotice />
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
