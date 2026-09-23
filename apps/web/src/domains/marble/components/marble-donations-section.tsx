"use client";

import { ReceiptText } from "lucide-react";
import { MarbleDataPanel } from "./marble-data-panel";

/** Home's lower pane keeps the imported lyrics pane's header and scroll layout. */
export function MarbleDonationsSection() {
  return (
    <section aria-label="후원 내역" className="h-full overflow-y-auto border-t bg-background">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background px-3 py-2 text-xs text-muted-foreground">
        <ReceiptText className="size-3 shrink-0" aria-hidden="true" />
        <span className="shrink-0">후원 내역</span>
      </div>
      <MarbleDataPanel view="donations" embedded />
    </section>
  );
}
