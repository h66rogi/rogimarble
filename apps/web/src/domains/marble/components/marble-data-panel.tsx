"use client";

import { useEffect, useRef, useState } from "react";
import type { DonationEventDto, ObsTokenDto } from "@rogimarble/contracts";
import { api } from "../../../../lib/api";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  ConsoleNotice,
  ConsolePanel,
  ConsoleSelect,
  ConsoleDetails,
} from "@/shared/components/common/console-ui";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { ConfigurationWorkspace } from "./configuration/configuration-workspace";
import type { ConfigurationSection } from "./configuration/configuration-workspace";
import { LiveLayoutEditor } from "./live-layout-editor";
import { OVERLAY_PARTS, overlayPartUrl } from '../overlay-parts';

const operationNames: Record<string, string> = {
  roll_dice: "주사위 굴리기",
  set_direction: "방향 변경",
  set_position: "위치 보정",
  pause: "일시정지",
  resume: "재개",
  create_session: "세션 시작",
  end_session: "세션 종료",
  adjust_inventory: "보상 수량 변경",
  create_mission: "미션 생성",
  complete_mission: "미션 완료",
  waive_mission: "미션 면제",
  use_shield: "실드 사용",
  "config.created": "설정 초안 생성",
  "config.updated": "설정 변경",
  "config.validated": "설정 검증",
  "config.validation_failed": "설정 검증 실패",
  "config.published": "설정 게시",
};
const resultNames: Record<string, string> = {
  matched: "규칙 일치",
  no_match: "일치하는 규칙 없음",
  failed: "처리 실패",
  pending: "처리 대기",
  held: "운영자 확인 필요",
  ignored: "게임 미적용",
};
const reasonNames: Record<string, string> = {
  reconnect_ambiguous: "재연결 구간에서 수신되어 운영자 확인이 필요합니다.",
  unsupported_kind: "지원하지 않는 후원 종류입니다.",
  rules_not_published: "게시된 후원 규칙이 없습니다.",
  no_bound_session: "진행 중인 게임 세션과 연결되지 않았습니다.",
  disabled: "비활성화된 규칙입니다.",
  no_exact_match: "정확히 일치하는 후원 규칙이 없습니다.",
  multi_roll_disabled: "연속 주사위 규칙이 비활성화되어 있습니다.",
  paused_movement: "게임이 일시정지되어 이동 처리를 기다립니다.",
  ready: "처리를 기다리고 있습니다.",
  multi_roll_pending: "남은 주사위 진행을 기다립니다.",
  rule_executed: "게임에 적용했습니다.",
  bound_session_ended: "연결된 게임 세션이 종료되었습니다.",
  snapshot_rule_invalid: "후원 당시의 규칙을 처리할 수 없습니다.",
};

export function MarbleDataPanel({
  view,
  embedded = false,
  configSection = "rules",
}: {
  view: "donations" | "operations" | "obs" | "config" | "sessions" | "missions";
  embedded?: boolean;
  configSection?: ConfigurationSection;
}) {
  const [items, setItems] = useState<readonly unknown[]>([]);
  const [tokens, setTokens] = useState<readonly ObsTokenDto[]>([]);
  const [label, setLabel] = useState("방송 OBS");
  const [issued, setIssued] = useState<{ id: string; url: string } | null>(
    null,
  );
  const [message, setMessage] = useState("");
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [donor, setDonor] = useState("");
  const [result, setResult] = useState("");
  const [filters, setFilters] = useState({ donor: "", result: "" });
  const [cursor, setCursor] = useState<string | null>(null);
  const sequence = useRef(0);
  const busyRef = useRef(false);
  const backgroundBusyRef = useRef(false);
  const hasAdditionalPages = useRef(false);

  const load = async (append = false, background = false) => {
    if (background && (busyRef.current || backgroundBusyRef.current)) return;
    if (background) backgroundBusyRef.current = true;
    const requestId = ++sequence.current;
    if (!background) {
      busyRef.current = true;
      setBusy(true);
      setMessage("");
    }
    try {
      if (view === "donations") {
        const page = await api.donations({
          ...(filters.donor ? { donor: filters.donor } : {}),
          ...(filters.result ? { result: filters.result } : {}),
          ...(append && cursor ? { cursor } : {}),
        });
        if (requestId !== sequence.current) return;
        setItems((previous) =>
          append
            ? appendUnique(previous, page.items)
            : background && hasAdditionalPages.current
              ? mergeUnique(page.items, previous)
              : page.items,
        );
        if (append) hasAdditionalPages.current = true;
        if (!background || !hasAdditionalPages.current)
          setCursor(page.nextCursor);
        setConnected(page.collectionConnected);
      } else if (view === "operations") {
        const page = await api.operations(
          append ? (cursor ?? undefined) : undefined,
        );
        if (requestId !== sequence.current) return;
        setItems((previous) =>
          append ? [...previous, ...page.items] : page.items,
        );
        setCursor(page.nextCursor);
      } else if (view === "obs") {
        const values = await api.obsTokens();
        if (requestId === sequence.current) setTokens(values);
      }
    } catch (cause) {
      if (!background && requestId === sequence.current)
        setMessage(
          cause instanceof Error
            ? cause.message
            : "데이터를 불러오지 못했습니다.",
        );
    } finally {
      if (background) backgroundBusyRef.current = false;
      else if (requestId === sequence.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };
  useEffect(() => {
    setItems([]);
    setCursor(null);
    setIssued(null);
    hasAdditionalPages.current = false;
    void load();
    const timer =
      view === "donations"
        ? window.setInterval(() => void load(false, true), 4000)
        : null;
    return () => {
      if (timer != null) window.clearInterval(timer);
      sequence.current += 1;
      busyRef.current = false;
      backgroundBusyRef.current = false;
    };
  }, [view, filters.donor, filters.result]);
  const feedback = message && <ConsoleNotice>{message}</ConsoleNotice>;

  if (view === "obs")
    return (
      <Panel
        title="OBS 설정"
        description="읽기 전용 방송 화면 주소를 발급하고 회수합니다."
      >
        <LiveLayoutEditor />
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setBusy(true);
            setMessage("");
            void api
              .issueObsToken(label)
              .then(async (token) => {
                setIssued({
                  id: token.id,
                  url: new URL(token.overlayUrlPath, window.location.origin)
                    .href,
                });
                await load();
              })
              .catch((error) => setMessage(error.message))
              .finally(() => setBusy(false));
          }}
        >
          <Input
            aria-label="OBS 이름"
            value={label}
            maxLength={80}
            onChange={(event) => setLabel(event.target.value)}
          />
          <Button disabled={busy || !label.trim()}>주소 발급</Button>
        </form>
        {issued && (
          <ConsoleNotice variant="warning" title="OBS 브라우저 소스 주소">
            <p>
              주소는 지금만 표시됩니다. 통합 화면이나 필요한 파츠를 OBS 브라우저 소스로 추가하세요. 외부에 공유하지 마세요.
            </p>
            <Input
              readOnly
              aria-label="OBS 브라우저 소스 주소"
              value={issued.url}
              onFocus={(event) => event.target.select()}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(issued.url)
                    .then(() => setMessage("OBS 주소를 복사했습니다."))
                    .catch(() => setMessage("주소를 선택해서 복사해 주세요."))
                }
              >
                주소 복사
              </Button>
              <Button size="sm" variant="outline" asChild>
                <a href={issued.url} target="_blank" rel="noopener noreferrer">
                  방송 화면 열기
                </a>
              </Button>
            </div>
            <div className="space-y-2">
              {OVERLAY_PARTS.map((part) => {
                const url = overlayPartUrl(issued.url, part.id);
                return <Card key={part.id}>
                  <CardContent className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{part.label}</span>
                      <span className="text-xs text-muted-foreground">OBS 권장 크기 {part.width} × {part.height}px</span>
                    </div>
                    <Input readOnly aria-label={`${part.label} OBS 주소`} value={url} onFocus={(event) => event.target.select()} />
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(url).then(() => setMessage(`${part.label} 주소를 복사했습니다.`)).catch(() => setMessage('주소를 선택해서 복사해 주세요.'))}>주소 복사</Button>
                      <Button size="sm" variant="outline" asChild><a href={url} target="_blank" rel="noopener noreferrer">파츠 열기</a></Button>
                    </div>
                  </CardContent>
                </Card>;
              })}
            </div>
          </ConsoleNotice>
        )}
        {tokens.map((token) => (
          <Card key={token.id}>
            <CardContent>
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex-1">
                  {token.label} · …{token.tokenSuffix}
                </span>
                <span className="text-xs text-muted-foreground">
                  {token.revokedAt ? "회수됨" : "사용 가능"}
                </span>
                {!token.revokedAt && (
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      setBusy(true);
                      void api
                        .revokeObsToken(token.id)
                        .then(async () => {
                          if (issued?.id === token.id) setIssued(null);
                          await load();
                        })
                        .catch((error) => setMessage(error.message))
                        .finally(() => setBusy(false));
                    }}
                  >
                    회수
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {!tokens.length && (
          <p className="text-sm text-muted-foreground">
            발급한 주소가 없습니다.
          </p>
        )}
        {feedback}
      </Panel>
    );

  if (view === "donations")
    return (
      <Panel
        title="후원 내역"
        description="후원자·개수·메시지와 처리 결과를 확인합니다."
        embedded={embedded}
      >
        {!connected && (
          <ConsoleNotice>
            수집 연결을 확인하고 있습니다. 저장된 후원 내역은 계속 확인할 수
            있습니다.
          </ConsoleNotice>
        )}
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const next = { donor: donor.trim(), result };
            if (next.donor === filters.donor && next.result === filters.result)
              void load();
            else setFilters(next);
          }}
        >
          <Input
            className="min-w-0 flex-1"
            aria-label="후원자 검색"
            placeholder="후원자 이름"
            value={donor}
            onChange={(event) => setDonor(event.target.value)}
          />
          <ConsoleSelect
            aria-label="처리 결과"
            value={result}
            onValueChange={setResult}
            options={[
              { value: "", label: "전체 결과" },
              ...Object.entries(resultNames).map(([value, label]) => ({
                value,
                label,
              })),
            ]}
          />
          <Button disabled={busy}>조회</Button>
        </form>
        {(items as readonly DonationEventDto[]).map((item) => (
          <Card key={item.id}>
            <CardContent>
              <article className="space-y-1 text-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <strong className="flex-1">{item.donorDisplayName}</strong>
                  <strong>{item.amount}개</strong>
                  <span>{resultNames[item.result] ?? item.result}</span>
                </div>
                {item.message && <p className="break-words">{item.message}</p>}
                {donationReason(item.resultDetail) && (
                  <p className="text-sm text-muted-foreground">
                    {donationReason(item.resultDetail)}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {formatDate(item.occurredAt)}
                  {item.ruleId ? ` · 규칙 ${item.ruleId}` : ""}
                </p>
                {item.resultDetail != null && (
                  <ConsoleDetails title="처리 상세">
                    {typeof item.resultDetail === "string"
                      ? item.resultDetail
                      : JSON.stringify(item.resultDetail, null, 2)}
                  </ConsoleDetails>
                )}
              </article>
            </CardContent>
          </Card>
        ))}
        {!busy && !items.length && (
          <p className="text-sm text-muted-foreground">
            표시할 후원이 없습니다.
          </p>
        )}
        {cursor && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void load(true)}
          >
            더 보기
          </Button>
        )}
        {feedback}
      </Panel>
    );

  if (view === "operations")
    return (
      <Panel title="운영 기록" description="수동 조작과 설정 변경 내역입니다.">
        <Button variant="outline" disabled={busy} onClick={() => void load()}>
          새로고침
        </Button>
        {items.map((item, index) => {
          const record = item as Record<string, unknown>;
          return (
            <Card key={String(record.id ?? index)}>
              <CardContent>
                <article className="space-y-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="flex-1">
                      {operationNames[String(record.operation_type)] ??
                        String(record.operation_type ?? "운영 조작")}
                    </strong>
                    <Badge variant="secondary">{operationSource(record)}</Badge>
                    <time className="text-xs text-muted-foreground">
                      {formatDate(String(record.createdAt ?? ""))}
                    </time>
                  </div>
                  {typeof record.reason === "string" && (
                    <p>{reasonNames[record.reason] ?? record.reason}</p>
                  )}
                  <ConsoleDetails title="변경 전·후 상세">
                    {JSON.stringify(
                      {
                        before: record.before_state,
                        after: record.after_state,
                      },
                      null,
                      2,
                    )}
                  </ConsoleDetails>
                </article>
              </CardContent>
            </Card>
          );
        })}
        {!busy && !items.length && (
          <p className="text-sm text-muted-foreground">
            표시할 운영 기록이 없습니다.
          </p>
        )}
        {cursor && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void load(true)}
          >
            더 보기
          </Button>
        )}
        {feedback}
      </Panel>
    );
  if (view === "config") return <ConfigurationWorkspace section={configSection} />;
  return (
    <Panel
      title={view === "missions" ? "보상·미션" : "세션 기록"}
      description="게임 운영 탭에서 현재 미션과 세션을 관리합니다."
    >
      <p className="text-sm text-muted-foreground">
        이전 조작은 운영 기록에서 확인할 수 있습니다.
      </p>
    </Panel>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) ? date.toLocaleString("ko-KR") : "";
}
function mergeUnique(fresh: readonly unknown[], previous: readonly unknown[]) {
  const ids = new Set(
    fresh.map((item) => String((item as { id?: unknown }).id)),
  );
  return [
    ...fresh,
    ...previous.filter(
      (item) => !ids.has(String((item as { id?: unknown }).id)),
    ),
  ];
}
function appendUnique(previous: readonly unknown[], next: readonly unknown[]) {
  const ids = new Set(
    previous.map((item) => String((item as { id?: unknown }).id)),
  );
  return [
    ...previous,
    ...next.filter((item) => !ids.has(String((item as { id?: unknown }).id))),
  ];
}
function donationReason(detail: unknown) {
  const reason =
    typeof detail === "string"
      ? detail
      : detail && typeof detail === "object" && "reason" in detail
        ? String((detail as { reason: unknown }).reason)
        : "";
  return reasonNames[reason] ?? "";
}
function operationSource(record: Record<string, unknown>) {
  if (record.source_kind === "donation") return "후원 자동 처리";
  if (String(record.operation_type ?? "").startsWith("config."))
    return "설정 관리";
  return "운영자 수동 조작";
}
function Panel({
  title,
  description,
  children,
  embedded = false,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  embedded?: boolean;
}) {
  if (embedded) return <div className="space-y-4 p-3 md:p-5">{children}</div>;
  return (
    <div className="mx-auto max-w-4xl">
      <ConsolePanel title={title} description={description}>
        {children}
      </ConsolePanel>
    </div>
  );
}
