"use client";

import { useEffect, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { ConsoleNotice } from "@/shared/components/common/console-ui";
import type { OperatorSnapshot } from "../../../../lib/types";
import { api, type CollectorStatus } from "../../../../lib/api";

export function OperatingModeNotice() {
  const [snapshot, setSnapshot] = useState<OperatorSnapshot | null>(null);
  const [collector, setCollector] = useState<CollectorStatus | null>(null);
  useEffect(() => {
    const update = (event: Event) =>
      setSnapshot((event as CustomEvent<OperatorSnapshot>).detail);
    window.addEventListener("rogimarble:operator-state", update);
    return () =>
      window.removeEventListener("rogimarble:operator-state", update);
  }, []);
  useEffect(() => {
    let alive = true;
    const update = () =>
      void api
        .collectorStatus()
        .then((value) => {
          if (alive) setCollector(value);
        })
        .catch(() => {
          if (alive) setCollector(null);
        });
    update();
    const timer = setInterval(update, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  const mode = !snapshot
    ? "서버 연결 확인 중"
    : !snapshot.session
      ? "게임 시작 대기"
      : snapshot.session.previewOnly
        ? "효과 없는 검증 세션"
        : collector?.transport === "connected"
          ? "방송 운영"
          : "수동 운영";
  const collection = !collector
    ? "수집 연결 확인 중"
    : !collector.enabled
      ? "후원 수집 미연결"
      : collector.transport === "recovery_required"
        ? "후원 수집 복구 확인 필요"
        : collector.transport !== "connected"
          ? "후원 수집 연결 재시도 중"
          : collector.collectionActive
            ? "후원 수집 중"
            : ((
                {
                  waiting: "방송 시작 대기",
                  disabled: "수집 중지",
                  cookie_required: "수집 로그인 확인 필요",
                  auth_required: "수집 로그인 확인 필요",
                  reconnecting: "방송 재연결 중",
                } as Record<string, string>
              )[collector.collectionState] ?? "수집 상태 확인 중");
  const pending =
    (collector?.counts?.pending ?? 0) +
    (collector?.counts?.held ?? 0) +
    (collector?.counts?.failed ?? 0);
  return (
    <div className="shrink-0 px-4 pt-4">
      <ConsoleNotice
        title={`주루마블 · ${mode}`}
        variant={pending ? "warning" : "default"}
      >
        {collection}
        {pending ? ` · 확인할 후원 ${pending}건` : ""}
        <Button asChild variant="outline" size="sm">
          <a href="/collector">방송·수집 관리</a>
        </Button>
      </ConsoleNotice>
    </div>
  );
}
