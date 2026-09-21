"use client";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Copy, Loader2, Trash2 } from "lucide-react";
import type { AccessTokenDto } from "@rogimarble/contracts";
import {
  ConsoleNotice,
  ConsolePanel,
} from "@/shared/components/common/console-ui";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { api } from "../../lib/api";
export default function AccountPage() {
  const [account, setAccount] = useState<string | null>(null),
    [tokens, setTokens] = useState<readonly AccessTokenDto[]>([]),
    [issued, setIssued] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const refresh = async () => {
    const [session, list] = await Promise.all([
      api.bootstrapSession(),
      api.accessTokens(),
    ]);
    setAccount(session.operator.username);
    setTokens(list);
  };
  useEffect(() => {
    refresh().catch(() => setError("로그인이 필요합니다."));
  }, []);
  async function issue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setIssued("");
    setMessage("");
    setError("");
    const form = event.currentTarget,
      data = new FormData(form),
      localExpiry = String(data.get("expiresAt") || "");
    try {
      const result = await api.issueAccessToken(
        String(data.get("label")).trim(),
        localExpiry ? new Date(localExpiry).toISOString() : undefined,
      );
      setIssued(result.token);
      form.reset();
      await refresh();
      setMessage("새 토큰을 발급했습니다. 아래 값은 지금 한 번만 표시됩니다.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "토큰을 발급하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: string) {
    setBusy(true);
    setError("");
    try {
      await api.revokeAccessToken(id);
      await refresh();
      setMessage("토큰과 연결된 로그인 세션을 회수했습니다.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "토큰을 회수하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="flex h-12 items-center gap-3 border-b px-4">
        <a href="/" className="inline-flex items-center gap-1 text-sm">
          <ArrowLeft className="size-4" />
          운영 콘솔
        </a>
        <span className="text-sm text-muted-foreground">접근 토큰 관리</span>
      </header>
      <section className="mx-auto max-w-2xl space-y-6 px-5 py-10">
        <div>
          <h1 className="text-xl font-semibold">접근 토큰</h1>
          {account && (
            <p className="mt-2 text-sm text-muted-foreground">
              {account} 계정의 토큰을 발급하고 회수합니다.
            </p>
          )}
        </div>
        {!account ? (
          <Button asChild variant="outline">
            <a href="/login">로그인</a>
          </Button>
        ) : (
          <>
            <Card>
              <CardContent>
                <form
                  className="grid gap-3 sm:grid-cols-[1fr_190px_auto] sm:items-end"
                  onSubmit={issue}
                >
                  <div className="space-y-2">
                    <Label htmlFor="label">토큰 이름</Label>
                    <Input
                      id="label"
                      name="label"
                      maxLength={80}
                      placeholder="방송용 노트북"
                      required
                      disabled={busy}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="expiresAt">만료 시각 (선택)</Label>
                    <Input
                      id="expiresAt"
                      name="expiresAt"
                      type="datetime-local"
                      disabled={busy}
                    />
                  </div>
                  <Button disabled={busy}>
                    {busy && <Loader2 className="mr-2 size-4 animate-spin" />}새
                    토큰 발급
                  </Button>
                </form>
              </CardContent>
            </Card>
            {issued && (
              <ConsoleNotice variant="warning">
                <strong className="text-sm">
                  지금 안전한 곳에 복사하세요. 다시 표시되지 않습니다.
                </strong>
                <div className="flex gap-2">
                  <Input readOnly value={issued} aria-label="새 접근 토큰" />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void navigator.clipboard.writeText(issued)}
                  >
                    <Copy className="mr-2 size-4" />
                    복사
                  </Button>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setIssued("")}
                >
                  표시 닫기
                </Button>
              </ConsoleNotice>
            )}
            <div className="space-y-2">
              <h2 className="text-sm font-semibold">발급 내역</h2>
              {tokens.length ? (
                tokens.map((token) => (
                  <Card key={token.id}>
                    <CardContent>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium">
                            {token.label}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            만료{" "}
                            {new Date(token.expiresAt).toLocaleString("ko-KR")}{" "}
                            · 최근 사용{" "}
                            {token.lastUsedAt
                              ? new Date(token.lastUsedAt).toLocaleString(
                                  "ko-KR",
                                )
                              : "없음"}
                            {token.revokedAt ? " · 회수됨" : ""}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy || !!token.revokedAt}
                          onClick={() => void revoke(token.id)}
                        >
                          <Trash2 className="mr-2 size-4" />
                          회수
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  발급된 토큰이 없습니다.
                </p>
              )}
            </div>
          </>
        )}
        {error && <ConsoleNotice variant="destructive">{error}</ConsoleNotice>}
        {message && <ConsoleNotice>{message}</ConsoleNotice>}
      </section>
    </main>
  );
}
