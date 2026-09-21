"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { MessageSquare, Square, RefreshCw } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Badge } from "@/shared/components/ui/badge";
import { Card, CardContent } from "@/shared/components/ui/card";
import { ConsoleNotice } from "@/shared/components/common/console-ui";
import { api, ApiError, type ChatTestStatus } from "../../lib/api";

const states: Record<string, string> = {
  idle: "테스트 대기",
  blocked: "수집 거부 설정으로 종료",
  connecting: "방송 입장 중",
  joined: "입장 성공 · 첫 채팅 대기",
  receiving: "실제 채팅 수신 확인",
  stopping: "연결 종료 중",
  stopped: "테스트 종료",
  expired: "2분 테스트 완료",
  disconnected: "방송 연결 끊김",
  offline: "방송 종료 / 대기",
  cookie_required: "로그인 쿠키 확인 필요",
  auth_required: "방송 접근 인증 필요",
  failed: "방송 입장 실패",
};
const formatTime = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleTimeString("ko-KR", { hour12: false })
    : "아직 없음";

export function ChatReceptionTest({
  target,
  onTargetChange,
  allowed,
}: {
  target: string;
  onTargetChange: (value: string) => void;
  allowed: boolean;
}) {
  const [test, setTest] = useState<ChatTestStatus | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [now, setNow] = useState(Date.now());
  const alive = useRef(false),
    revision = useRef(0),
    reading = useRef(false),
    mutating = useRef(false);
  const refresh = useCallback(async () => {
    if (!allowed || reading.current || mutating.current) return;
    const version = revision.current;
    reading.current = true;
    try {
      const result = await api.chatTest();
      if (alive.current && version === revision.current) {
        setTest(result);
        setError("");
      }
    } catch (e) {
      if (alive.current && version === revision.current) {
        if (e instanceof ApiError && [401, 403].includes(e.status))
          setTest(null);
        setError(
          e instanceof Error ? e.message : "테스트 상태를 확인하지 못했습니다.",
        );
      }
    } finally {
      reading.current = false;
    }
  }, [allowed]);
  useEffect(() => {
    alive.current = true;
    if (allowed) void refresh();
    else {
      setTest(null);
      setError("");
    }
    return () => {
      alive.current = false;
      revision.current++;
    };
  }, [allowed, refresh]);
  useEffect(() => {
    if (!allowed) return;
    const id = setInterval(
      () => {
        setNow(Date.now());
        if (!document.hidden) void refresh();
      },
      test?.active ? 1000 : 5000,
    );
    return () => clearInterval(id);
  }, [allowed, refresh, test?.active]);
  async function action(kind: "start" | "stop") {
    if (!allowed || mutating.current) return;
    const channel = target.trim();
    if (kind === "start" && !/^[A-Za-z0-9_-]{1,50}$/.test(channel)) {
      setError("SOOP 채널 ID만 입력하세요. URL은 입력할 수 없습니다.");
      return;
    }
    if (kind === "stop" && !test?.sessionId) return;
    revision.current++;
    mutating.current = true;
    setBusy(true);
    setError("");
    try {
      const result =
        kind === "start"
          ? await api.startChatTest(channel, crypto.randomUUID())
          : await api.stopChatTest(test!.sessionId);
      if (alive.current) {
        setTest(result);
        setNow(Date.now());
      }
    } catch (e) {
      if (alive.current) {
        if (e instanceof ApiError && [401, 403].includes(e.status))
          setTest(null);
        setError(
          e instanceof Error ? e.message : "테스트 요청을 확인하지 못했습니다.",
        );
      }
    } finally {
      mutating.current = false;
      if (alive.current) {
        setBusy(
          false,
        ); /* Next poll recovers a start/stop response lost in transit. */
      }
    }
  }
  const remaining = test?.expiresAt
    ? Math.max(0, Math.ceil((Date.parse(test.expiresAt) - now) / 1000))
    : 0;
  return (
    <Card aria-labelledby="chat-reception-heading">
      <CardContent>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2
              id="chat-reception-heading"
              className="flex items-center gap-2 text-lg font-semibold"
            >
              <MessageSquare size={20} />
              입장·채팅 수집 테스트
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              실제 방송에 입장해 채팅이 들어오는지 확인합니다.
            </p>
          </div>
          <Badge variant="secondary">게임과 분리된 테스트</Badge>
        </div>
        <form
          className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            void action("start");
          }}
        >
          <div className="flex-1">
            <Label
              htmlFor="chat-test-target"
              className="mb-2 block"
            >
              입장할 SOOP 채널 ID
            </Label>
            <Input
              id="chat-test-target"
              value={target}
              onChange={(e) => onTargetChange(e.target.value)}
              maxLength={50}
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              placeholder="예: h66rogi"
            />
          </div>
          <Button
            type="submit"
            disabled={!allowed || busy || Boolean(test?.active)}
          >
            {busy && !test?.active ? "시작 요청 중…" : "입장·수집 시작"}
          </Button>
          {test?.active && (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void action("stop")}
            >
              <Square size={14} />
              테스트 종료
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={!allowed || busy}
            aria-label="채팅 테스트 상태 새로고침"
            onClick={() => void refresh()}
          >
            <RefreshCw size={14} />
          </Button>
        </form>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          최대 2분 · 동시에 한 채널 · 최근 채팅 20개만 표시합니다. 운영 수집
          채널은 유지하며 테스트 채팅·후원은 게임에 전달하거나 DB에 저장하지
          않습니다. 창을 닫아도 2분 제한은 서버에서 적용됩니다. 종료 결과는 최대
          5분 후 지워집니다.
        </p>
        {!allowed && (
          <p className="mt-3 text-sm text-muted-foreground">
            채팅 테스트에는 로그인과 채널 운영 권한이 필요합니다.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
            {test ? " 표시된 결과는 마지막 조회값입니다." : ""}
          </p>
        )}
        {allowed && test && (
          <Card className="mt-5">
            <CardContent>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">
                    {test.channelId
                      ? `테스트 채널 · ${test.channelId}`
                      : "아직 시작한 테스트가 없습니다."}
                  </p>
                  <p role="status" className="mt-1 font-semibold">
                    {states[test.state] ?? "상태 확인 필요"}
                  </p>
                </div>
                {test.active && (
                  <span className="text-sm tabular-nums">
                    {remaining > 0
                      ? `자동 종료까지 ${remaining}초`
                      : "자동 종료 확인 중"}
                  </span>
                )}
              </div>
              {test.sessionId && (
                <>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="text-muted-foreground">입장 확인</dt>
                      <dd className="mt-1 font-medium">
                        {formatTime(test.joinedAt)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">수신 채팅</dt>
                      <dd
                        className="mt-1 font-medium"
                        data-testid="chat-received-count"
                      >
                        {test.receivedCount}건
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">마지막 수신</dt>
                      <dd className="mt-1 font-medium">
                        {formatTime(test.lastReceivedAt)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">시작 시각</dt>
                      <dd className="mt-1 font-medium">
                        {formatTime(test.startedAt)}
                      </dd>
                    </div>
                  </dl>
                  {!test.messages.length && (
                    <div className="mt-4">
                      <ConsoleNotice>
                        {test.joinedAt
                          ? "입장은 확인됐지만 아직 수신한 일반 채팅이 없습니다. 방송이 조용한 경우 수신 확인까지 기다려 주세요."
                          : "입장 성공과 첫 채팅 수신을 각각 확인합니다."}
                      </ConsoleNotice>
                    </div>
                  )}
                  {test.messages.length > 0 && (
                    <div className="mt-4">
                      <h3 className="text-sm font-medium">최근 수신 채팅</h3>
                      <ol
                        className="mt-2 max-h-80 space-y-2 overflow-y-auto"
                        aria-label="테스트 수신 채팅"
                      >
                        {test.messages.map((message) => (
                          <li
                            key={message.sequence}
                            className="break-words border-b py-3 text-sm"
                          >
                            <div className="flex flex-wrap justify-between gap-2">
                              <span className="font-semibold">
                                {message.displayName || "표시 이름 없음"}
                              </span>
                              <time className="text-xs text-muted-foreground">
                                {formatTime(message.receivedAt)}
                              </time>
                            </div>
                            <p className="mt-1 whitespace-pre-wrap break-all">
                              {message.message}
                            </p>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                  {[
                    "disconnected",
                    "failed",
                    "cookie_required",
                    "auth_required",
                  ].includes(test.state) && (
                    <div className="mt-3">
                      <ConsoleNotice variant="warning">
                        입장 또는 수신 연결이 끝났습니다. 방송·쿠키 상태를
                        확인한 뒤 새 테스트를 시작하세요.
                      </ConsoleNotice>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
}
