"use client";

import { useEffect, useRef, useState } from "react";
import type { ChannelOverlayTokenDto } from "@rogimarble/contracts";
import { api } from "@/lib/api";
import { ExternalLink } from "lucide-react";
import { ConsoleNotice } from "@/shared/components/common/console-ui";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { LiveLayoutEditor } from "./live-layout-editor";

export function HomeOverlayPanel() {
  const [token, setToken] = useState<ChannelOverlayTokenDto | null>(null);
  const [origin, setOrigin] = useState("");
  const [feedback, setFeedback] = useState<{ text: string; variant: "success" | "warning" } | null>(null);
  const requestSequence = useRef(0);

  useEffect(() => {
    let alive = true;
    setOrigin(window.location.origin);
    const load = (clear = false) => {
      const requestId = ++requestSequence.current;
      if (clear) setToken(null);
      void api.overlayToken()
        .then((value) => { if (alive && requestId === requestSequence.current) { setToken(value); setFeedback(null); } })
        .catch((error) => {
          if (alive && requestId === requestSequence.current) {
            setToken(null);
            setFeedback({ text: error instanceof Error ? error.message : "오버레이 주소를 불러오지 못했습니다.", variant: "warning" });
          }
        });
    };
    const reload = () => load(true);
    load();
    window.addEventListener("focus", reload);
    window.addEventListener("rogimarble:overlay-token-changed", reload);
    return () => {
      alive = false;
      window.removeEventListener("focus", reload);
      window.removeEventListener("rogimarble:overlay-token-changed", reload);
    };
  }, []);

  const url = token?.overlayUrlPath && origin
    ? new URL(token.overlayUrlPath, origin).href
    : null;

  return (
    <div className="space-y-5">
      <section className="space-y-3" aria-label="통합 오버레이 주소">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">통합 오버레이 주소</h3>
          <p className="text-sm text-muted-foreground">주소 하나로 전체 화면을 표시합니다. OBS 브라우저 소스에 1920 × 1080px로 추가하세요.</p>
        </div>
        {url && <div className="flex items-center gap-1.5">
          <Input readOnly aria-label="통합 오버레이 OBS 주소" value={url} className="min-w-0 flex-1" />
          <Button size="sm" variant="outline" className="shrink-0" onClick={() => {
            void navigator.clipboard.writeText(url)
              .then(() => setFeedback({ text: "통합 오버레이 주소를 복사했습니다.", variant: "success" }))
              .catch(() => setFeedback({ text: "주소를 선택해서 복사해 주세요.", variant: "warning" }));
          }}><ExternalLink className="size-3" aria-hidden="true" />복사</Button>
        </div>}
        {token && !token.overlayUrlPath && <ConsoleNotice variant="warning">기존 주소를 다시 표시할 수 없습니다. 상단 오버레이 설정에서 주소를 교체해 주세요.</ConsoleNotice>}
        {!token && !feedback && <p className="text-sm text-muted-foreground">오버레이 주소를 불러오는 중입니다.</p>}
        {feedback && <ConsoleNotice variant={feedback.variant}>{feedback.text}</ConsoleNotice>}
        <p className="text-xs text-muted-foreground">주소는 외부에 공유하지 마세요. 파츠별 주소와 주소 교체는 상단 오버레이 설정에서 관리합니다.</p>
      </section>
      <LiveLayoutEditor />
    </div>
  );
}
