"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ChannelOverlayTokenDto, DonationEventDto } from "@rogimarble/contracts";
import { api } from "../../../../lib/api";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { MaskedUrlInput } from "@/shared/components/ui/masked-url-input";
import {
  ConsoleNotice,
  ConsolePanel,
  ConsoleSelect,
  ConsoleDetails,
} from "@/shared/components/common/console-ui";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { PillTabs } from "@/shared/components/ui/pill-tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/shared/components/ui/alert-dialog";
import { ConfigurationWorkspace } from "./configuration/configuration-workspace";
import type { ConfigurationSection } from "./configuration/configuration-workspace";
import { LiveLayoutEditor } from "./live-layout-editor";
import { OVERLAY_PARTS, overlayPartUrl } from '../overlay-parts';
import { Link2, Monitor } from "lucide-react";

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
  const [overlayToken, setOverlayToken] = useState<ChannelOverlayTokenDto | null>(null);
  const overlayTabId = useId();
  const [overlayTab, setOverlayTab] = useState<"settings" | "addresses">("settings");
  const [origin, setOrigin] = useState("");
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

  useEffect(() => setOrigin(window.location.origin), []);

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
        const value = await api.overlayToken();
        if (requestId === sequence.current) setOverlayToken(value);
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
    setOverlayToken(null);
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
      <div className="mx-auto w-full max-w-[1600px] space-y-6" data-testid="overlay-workspace">
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">오버레이 설정</h1>
            <Badge variant="secondary">방송 화면</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            방송 화면 배치와 파츠별 스타일을 설정하고 OBS 주소를 확인하세요.
          </p>
        </header>
        <div>
          <PillTabs
            ariaLabel="오버레이 세부 메뉴"
            idPrefix={overlayTabId}
            activeTab={overlayTab}
            onTabChange={setOverlayTab}
            tabs={[
              { id: "settings", label: "오버레이 설정", icon: Monitor },
              { id: "addresses", label: "오버레이 주소", icon: Link2 },
            ]}
          />
          <div
            id={`${overlayTabId}-panel-settings`}
            role="tabpanel"
            aria-labelledby={`${overlayTabId}-tab-settings`}
            hidden={overlayTab !== "settings"}
            className="mt-6"
          >
            <LiveLayoutEditor />
          </div>
          <div
            id={`${overlayTabId}-panel-addresses`}
            role="tabpanel"
            aria-labelledby={`${overlayTabId}-tab-addresses`}
            hidden={overlayTab !== "addresses"}
            className="mt-6"
          >
            {overlayToken && (
              <Card>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="flex-1">
                      채널 오버레이 주소 · …{overlayToken.tokenSuffix}
                    </span>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm" disabled={busy}>주소 교체</Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>오버레이 주소를 교체할까요?</AlertDialogTitle>
                          <AlertDialogDescription>
                            기존 주소는 즉시 중단됩니다. OBS 브라우저 소스에 새 주소를 다시 입력해야 합니다.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>취소</AlertDialogCancel>
                          <AlertDialogAction onClick={() => {
                            setBusy(true);
                            setMessage("");
                            void api.rotateOverlayToken(overlayToken.id)
                              .then(setOverlayToken)
                              .catch(async (error) => { await load(); setMessage(error.message); })
                              .finally(() => setBusy(false));
                          }}>주소 교체</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                  {overlayToken.overlayUrlPath && origin && (
                    <OverlayTokenUrls
                      key={overlayToken.id}
                      baseUrl={new URL(overlayToken.overlayUrlPath, origin).href}
                      onMessage={setMessage}
                    />
                  )}
                  {!overlayToken.overlayUrlPath && (
                    <ConsoleNotice variant="warning">
                      기존 주소는 원문이 저장되지 않아 다시 표시할 수 없습니다. 주소를 교체한 뒤 OBS에서 새 주소를 사용해 주세요.
                    </ConsoleNotice>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
          {feedback && <div className="mt-6">{feedback}</div>}
        </div>
      </div>
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

function OverlayTokenUrls({
  baseUrl,
  onMessage,
}: {
  baseUrl: string;
  onMessage: (message: string) => void;
}) {
  const copy = (url: string, label: string) =>
    void navigator.clipboard.writeText(url)
      .then(() => onMessage(`${label} 주소를 복사했습니다.`))
      .catch(() => onMessage("주소를 선택해서 복사해 주세요."));

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">주소를 복사해 OBS 브라우저 소스에 붙여 넣으세요. 외부에 공유하지 마세요.</p>
      <OverlayUrlRow label="통합 오버레이" url={baseUrl} width={1920} height={1080} onCopy={copy} featured />
      {OVERLAY_PARTS.map((part) => (
        <OverlayUrlRow
          key={part.id}
          label={part.label}
          url={overlayPartUrl(baseUrl, part.id)}
          width={part.width}
          height={part.height}
          onCopy={copy}
        />
      ))}
    </div>
  );
}

function OverlayUrlRow({
  label,
  url,
  width,
  height,
  onCopy,
  featured = false,
}: {
  label: string;
  url: string;
  width: number;
  height: number;
  onCopy: (url: string, label: string) => void;
  featured?: boolean;
}) {
  return (
    <Card variant={featured ? "featured" : "default"}>
      <CardContent className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{label}</span>
            {featured && <Badge>추천 · 하나로 전체 표시</Badge>}
          </div>
          <span className="text-xs text-muted-foreground">OBS 권장 크기 {width} × {height}px</span>
        </div>
        {featured && <p className="text-sm text-muted-foreground">이 주소 하나만 OBS에 추가하면 모든 파츠가 함께 표시됩니다.</p>}
        <MaskedUrlInput label={`${label} OBS 주소`} value={url} />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => onCopy(url, label)}>주소 복사</Button>
          <Button size="sm" variant="outline" asChild><a href={url} target="_blank" rel="noopener noreferrer">화면 열기</a></Button>
        </div>
      </CardContent>
    </Card>
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
