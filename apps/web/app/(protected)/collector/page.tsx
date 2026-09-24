"use client";

import Link from "next/link";
import { ChatReceptionTest } from "./chat-reception-test";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ExternalLink,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  ScrollText,
} from "lucide-react";
import {
  ConsolePanel,
  ConsoleNotice,
  ConsoleCheck,
} from "@/shared/components/common/console-ui";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Label } from "@/shared/components/ui/label";
import { Badge } from "@/shared/components/ui/badge";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/shared/components/ui/collapsible";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { PillTabs, type PillTabItem } from "@/shared/components/ui/pill-tabs";
import { MarbleDataPanel } from "@/domains/marble/components/marble-data-panel";
import {
  api,
  ApiError,
  type BroadcastStatus,
  type CollectorStatus,
} from "../../../lib/api";

const labels: Record<string, string> = {
  waiting: "방송 시작 대기",
  connected: "수집 중",
  connecting: "방송 연결 중",
  reconnecting: "방송 재연결 중",
  cookie_required: "로그인 쿠키 확인 필요",
  auth_required: "방송 접근 인증 필요",
  lookup_failed: "방송 조회 실패",
  storage_delayed: "후원 저장 지연",
  storage_stopped: "후원 저장 중단",
  disabled: "수집 중지",
  recovery_required: "수집 복구 확인 필요",
};
const transportLabels: Record<string, string> = {
  connected: "정상 연결",
  connecting: "연결 확인 중",
  error: "연결 오류",
  disabled: "미설정",
  recovery_required: "복구 확인 필요",
};
const broadcastLabels: Record<string, string> = {
  live: "방송 중",
  offline: "방송 종료 / 대기",
  cookie_required: "쿠키 갱신 필요",
  auth_required: "접근 인증 필요",
  lookup_failed: "방송 여부 확인 실패",
};
const errors: Record<string, string> = {
  configuration_missing: "수집기 연결 설정을 확인해야 합니다.",
  collector_access_denied:
    "수집기 인증서 또는 채널 접근 권한을 확인해야 합니다.",
  collector_unavailable:
    "수집기에 연결되지 않습니다. 수동 게임 운영은 계속 사용할 수 있습니다.",
  cursor_recovery_required:
    "보관 범위 또는 저장 세대가 바뀌었습니다. 수신을 재개하기 전에 운영 복구가 필요합니다.",
  inbox_dispatch_failed:
    "저장한 후원을 게임에 적용하지 못했습니다. 후원 내역과 운영 기록을 확인하세요.",
};
type DeveloperTab = "status" | "tests" | "operations";
const developerTabs: readonly PillTabItem<DeveloperTab>[] = [
  { id: "status", label: "수집 현황", icon: Radio },
  { id: "tests", label: "방송 테스트", icon: Search },
  { id: "operations", label: "운영 기록", icon: ScrollText },
];
function time(value?: string | null) {
  return value
    ? new Date(value).toLocaleString("ko-KR", { hour12: false })
    : "아직 기록 없음";
}
function MetricCard({
  title,
  value,
  detail,
}: {
  title: string;
  value: ReactNode;
  detail: ReactNode;
}) {
  return (
    <ConsolePanel title={title} description={detail}>
      <p className="text-xl font-semibold">{value}</p>
    </ConsolePanel>
  );
}
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-2 border-b py-3 last:border-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="max-w-full break-all text-right text-sm font-medium">
        {children}
      </dd>
    </div>
  );
}

export default function CollectorPage() {
  const tabId = useId();
  const [activeTab, setActiveTab] = useState<DeveloperTab>("status");
  const [status, setStatus] = useState<CollectorStatus | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [auto, setAuto] = useState(true),
    [login, setLogin] = useState(false),
    [authenticated, setAuthenticated] = useState(false);
  const [target, setTarget] = useState(""),
    [checking, setChecking] = useState(false),
    [result, setResult] = useState<BroadcastStatus | null>(null),
    [checkError, setCheckError] = useState("");
  const alive = useRef(true),
    inFlight = useRef(false),
    initialized = useRef(false);
  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const next = await api.collectorStatus();
      if (!alive.current) return;
      setStatus(next);
      setError("");
      setLogin(false);
      if (!initialized.current && next.collectorChannelId) {
        setTarget(next.collectorChannelId);
        initialized.current = true;
      }
    } catch (e) {
      if (alive.current) {
        setLogin(e instanceof ApiError && e.status === 401);
        if (e instanceof ApiError && e.status === 401) {
          setStatus(null);
          setResult(null);
        }
        setError(
          e instanceof ApiError && e.status === 401
            ? "로그인 후 방송·수집 상태를 확인할 수 있습니다."
            : "상태를 갱신하지 못했습니다. 아래 값은 마지막 조회 결과입니다.",
        );
      }
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    void api
      .bootstrapSession()
      .then(() => {
        if (alive.current) setAuthenticated(true);
        return refresh();
      })
      .catch((e) => {
        if (alive.current) {
          const unauthorized = e instanceof ApiError && e.status === 401;
          setLogin(unauthorized);
          setError(
            unauthorized
              ? "로그인 후 방송·수집 상태를 확인할 수 있습니다."
              : "접속 상태를 확인하지 못했습니다. 잠시 후 새로고침하세요.",
          );
        }
      });
    return () => {
      alive.current = false;
    };
  }, [refresh]);
  useEffect(() => {
    if (!auto || login) return;
    const id = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 5000);
    return () => clearInterval(id);
  }, [auto, login, refresh]);
  async function check(event: FormEvent) {
    event.preventDefault();
    const id = target.trim();
    if (!/^[A-Za-z0-9_-]{1,50}$/.test(id)) {
      setCheckError("SOOP 채널 ID만 입력하세요. 예: h66rogi");
      return;
    }
    setChecking(true);
    setCheckError("");
    setResult(null);
    try {
      const response = await api.checkBroadcast(id);
      if (alive.current) setResult(response);
    } catch (e) {
      if (alive.current)
        setCheckError(
          e instanceof Error ? e.message : "방송을 조회하지 못했습니다.",
        );
    } finally {
      if (alive.current) setChecking(false);
    }
  }
  const pending =
    (status?.counts?.pending ?? 0) +
    (status?.counts?.held ?? 0) +
    (status?.counts?.failed ?? 0);
  const outdated = Boolean(error) || Boolean(status?.stale);
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-5">
          <div className="flex items-center gap-3">
            <Button asChild variant="outline" size="icon">
              <Link href="/" aria-label="운영 콘솔로 돌아가기">
                <ArrowLeft />
              </Link>
            </Button>
            <div>
              <h1 className="text-lg font-bold">개발자도구</h1>
              <p className="text-xs text-muted-foreground">
                방송·수집 상태와 운영 기록을 확인하세요.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ConsoleCheck checked={auto} onCheckedChange={setAuto}>
              5초마다 갱신
            </ConsoleCheck>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refresh()}
              disabled={busy || login}
            >
              <RefreshCw className={busy ? "animate-spin" : ""} size={14} />
              상태 새로고침
            </Button>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl space-y-6 px-5 py-7">
        {error && (
          <ConsoleNotice variant="warning">
            {error}
            {login && (
              <Link href="/login" className="ml-3 underline">
                로그인하기
              </Link>
            )}
          </ConsoleNotice>
        )}
        <PillTabs
          tabs={developerTabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          ariaLabel="개발자도구 메뉴"
          idPrefix={tabId}
        />
        <div
          id={`${tabId}-panel-status`}
          role="tabpanel"
          aria-labelledby={`${tabId}-tab-status`}
          hidden={activeTab !== "status"}
          className="space-y-6"
        >
        <Card>
          <CardContent>
            <section className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Radio className="text-muted-foreground" size={20} />
                <div>
                  <p className="font-semibold">
                    운영 수집 채널 · {status?.collectorChannelId ?? "확인 중"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    이 채널의 후원·채팅이 주루마블에 전달됩니다.
                  </p>
                </div>
              </div>
              <Badge variant="secondary">
                {outdated
                  ? "마지막 조회값 · 최신 상태 확인 필요"
                  : `상태 확인 ${time(status?.lastCheckedAt)}`}
              </Badge>
            </section>
          </CardContent>
        </Card>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="수집기 서버 연결"
            value={
              outdated
                ? "최신 상태 확인 필요"
                : status
                  ? (transportLabels[status.transport] ?? "확인 필요")
                  : "확인 중"
            }
            detail="주루마블 서버 ↔ 수집기 인증 연결"
          />
          <MetricCard
            title="운영 방송 수집"
            value={
              outdated
                ? "이전 상태"
                : status
                  ? (labels[status.collectionState] ?? status.collectionState)
                  : "확인 중"
            }
            detail={
              !outdated && status?.collectionActive
                ? "실제 방송 입력을 수집하고 있습니다."
                : "방송 대기와 연결 오류는 서로 다른 상태입니다."
            }
          />
          <MetricCard
            title="마지막 방송 입력"
            value={
              <span className="text-base">
                {time(status?.remote?.lastReceivedAt)}
              </span>
            }
            detail="수집기가 마지막으로 관측한 입력 시각"
          />
          <MetricCard
            title="확인할 후원"
            value={status ? `${pending.toLocaleString()}건` : "—"}
            detail="게임 처리 대기 · 검토 보류 · 실패 합계"
          />
        </div>
        {status?.errorCode && (
          <ConsoleNotice variant="warning">
            {errors[status.errorCode] ?? "수집 상태를 확인해야 합니다."}
          </ConsoleNotice>
        )}
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardContent>
              <section className="">
                <h2 className="flex items-center gap-2 font-semibold">
                  <ShieldCheck size={18} />
                  주루마블 수신 현황
                </h2>
                <dl className="mt-3">
                  <Row label="마지막 후원 저장">
                    {time(status?.lastDonationStoredAt)}
                  </Row>
                  <Row label="마지막 채팅 저장">
                    {time(status?.lastChatStoredAt)}
                  </Row>
                  <Row label="수집기에서 가져올 후원">
                    {status?.donationBacklog != null
                      ? `${status.donationBacklog}건`
                      : "비교 대기"}
                  </Row>
                  <Row label="채팅 수신">
                    {status?.chatConnected
                      ? "수신 확인됨"
                      : status?.chatStreamOpen
                        ? "스트림 요청됨 · 첫 입력 대기"
                        : "연결 대기"}
                  </Row>
                </dl>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  방송이 조용하면 최근 수신 시각이 오래될 수 있습니다. 후원은
                  저장 후 확인 응답을 보내며, 채팅은 최근 보관 범위에서
                  전달됩니다.
                </p>
              </section>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <section className="">
                <h2 className="font-semibold">후원 처리 내역</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  현재 DB에 보관된 수신 건수입니다. 실제 별풍선 결제 총액과는
                  다릅니다.
                </p>
                <dl className="mt-3">
                  {[
                    ["pending", "게임 처리 대기"],
                    ["held", "검토 보류"],
                    ["failed", "처리 실패"],
                    ["executed", "게임 반영 완료"],
                    ["ignored", "게임 미적용"],
                  ].map(([key, label]) => (
                    <Row key={key} label={label}>
                      {status?.counts
                        ? (status.counts[key] ?? 0).toLocaleString()
                        : "—"}
                      건
                    </Row>
                  ))}
                </dl>
                <Link
                  href="/"
                  className="mt-3 inline-block text-sm underline underline-offset-4"
                >
                  운영 콘솔에서 후원 내역 보기
                </Link>
              </section>
            </CardContent>
          </Card>
        </div>
        <ConsolePanel title="상세 진단 정보">
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm">
                진단 정보 펼치기
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <dl className="mt-3">
                <Row label="수집기 저장 위치">
                  {status?.remote?.currentCursor?.channelOffset ?? "—"}
                </Row>
                <Row label="주루마블 저장 위치">
                  {status?.cursor?.channelOffset ?? "—"}
                </Row>
                <Row label="재생 시작 위치">
                  {status?.remote?.earliestCursor?.channelOffset ?? "—"}
                </Row>
                <Row label="수집기 저장 세대">
                  {status?.remote?.currentCursor?.journalGeneration ?? "—"}
                </Row>
                <Row label="복구 버전">
                  {status?.remote?.recoveryRevision ?? "—"}
                </Row>
                <Row label="수집 품질 사유">
                  {status?.remote?.qualityReasons?.join(", ") ||
                    "보고된 사유 없음"}
                </Row>
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">
                이 화면은 수집기 RPC와 주루마블 저장 상태를 조회합니다. EC2 전체
                컨테이너의 상태나 백업 복원 성공을 판정하는 화면은 아닙니다.
              </p>
            </CollapsibleContent>
          </Collapsible>
        </ConsolePanel>
        </div>
        <div
          id={`${tabId}-panel-tests`}
          role="tabpanel"
          aria-labelledby={`${tabId}-tab-tests`}
          hidden={activeTab !== "tests"}
          className="space-y-6"
        >
        <Card>
          <CardContent>
            <section className="">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">방송 조회 테스트</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    다른 SOOP 채널도 ID를 입력해 방송 여부와 정보를 확인할 수
                    있습니다.
                  </p>
                </div>
                <Badge variant="secondary">조회 전용</Badge>
              </div>
              <form
                onSubmit={check}
                className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end"
              >
                <div className="flex-1">
                  <Label htmlFor="broadcast-channel" className="mb-2 block">
                    SOOP 채널 ID
                  </Label>
                  <Input
                    id="broadcast-channel"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    placeholder="예: h66rogi"
                    maxLength={50}
                    autoCapitalize="none"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={checking || !status?.canCheckBroadcast || login}
                >
                  <Search size={16} />
                  {checking ? "방송 확인 중…" : "방송 조회"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!status?.collectorChannelId || checking}
                  onClick={() => {
                    setTarget(status?.collectorChannelId ?? "");
                    setResult(null);
                    setCheckError("");
                  }}
                >
                  운영 채널 입력
                </Button>
              </form>
              {!login && status && !status.canCheckBroadcast && (
                <p className="mt-3 text-sm text-muted-foreground">
                  방송 조회 테스트는 채널 운영 권한이 필요합니다.
                </p>
              )}
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                조회는 운영 수집 채널을 변경하거나 테스트 채널의 후원·채팅을
                게임에 연결하지 않습니다. 연령제한 방송은 수집기의 로그인 쿠키로
                확인합니다.
              </p>
              {checkError && (
                <p role="alert" className="mt-4 text-sm text-destructive">
                  {checkError}
                </p>
              )}
              {result && (
                <Card>
                  <CardContent>
                    <div role="status" className="mt-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <span className="text-xs text-muted-foreground">
                            {result.productionTarget
                              ? "운영 채널 조회"
                              : "테스트 채널 조회"}{" "}
                            · {result.channelId}
                          </span>
                          <h3 className="mt-1 text-lg font-bold">
                            {broadcastLabels[result.state] ?? "확인 필요"}
                          </h3>
                        </div>
                        <a
                          href={`https://play.sooplive.com/${encodeURIComponent(result.channelId)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-sm underline underline-offset-4"
                        >
                          SOOP 방송 열기
                          <ExternalLink size={14} />
                        </a>
                      </div>
                      {result.title && (
                        <p className="mt-3 break-words font-medium">
                          {result.title}
                        </p>
                      )}
                      <dl className="mt-3">
                        <Row label="방송자">
                          {result.displayName || "플랫폼 미제공"}
                        </Row>
                        <Row label="방송 번호">
                          {result.broadcastId || "없음 / 미제공"}
                        </Row>
                        <Row label="확인 시각">
                          {time(result.checkedAt)}
                          {result.cached ? " · 최근 10초 조회 재사용" : ""}
                        </Row>
                      </dl>
                      {["auth_required", "cookie_required"].includes(
                        result.state,
                      ) && (
                        <p className="mt-3 text-sm text-warning">
                          방송 종료로 판단하지 않았습니다. 수집기 로그인 상태
                          또는 방송 접근 권한을 확인하세요.
                        </p>
                      )}
                      {result.state === "lookup_failed" && (
                        <p className="mt-3 text-sm text-warning">
                          채널 ID, 플랫폼 응답 또는 네트워크를 확인하세요. 방송
                          종료를 확인한 결과가 아닙니다.
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </section>
          </CardContent>
        </Card>
        <ChatReceptionTest
          target={target}
          onTargetChange={setTarget}
          allowed={Boolean(status?.canCheckBroadcast) && !login}
        />
        </div>
        <div
          id={`${tabId}-panel-operations`}
          role="tabpanel"
          aria-labelledby={`${tabId}-tab-operations`}
          hidden={activeTab !== "operations"}
        >
        {authenticated && !login && <MarbleDataPanel view="operations" />}
        </div>
      </div>
    </main>
  );
}
