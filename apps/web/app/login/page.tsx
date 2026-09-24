"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowLeft, Radio } from "lucide-react";
import {
  ConsoleNotice,
  ConsolePanel,
} from "@/shared/components/common/console-ui";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { api } from "../../lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    api
      .authConfig()
      .then(() => setReady(true))
      .catch(() =>
        setError(
          "로그인 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        ),
      );
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      await api.loginToken(String(data.get("token")).trim());
      router.replace("/");
    } catch {
      setError(
        "접근 토큰이 올바르지 않거나 만료·삭제되었습니다. 새 토큰을 발급받아 다시 입력해 주세요.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4 text-sm font-medium">
        <Radio className="size-4" />
        주루마블 운영 콘솔
      </header>
      <div className="flex flex-1 items-center justify-center px-5 py-12">
        <section className="w-full max-w-sm">
          <ConsolePanel
            title="운영자 로그인"
            description="발급받은 접근 토큰을 입력하세요. 토큰은 이 브라우저에 저장되지 않습니다."
          >
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="token">접근 토큰</Label>
                <Input
                  id="token"
                  name="token"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={64}
                  required
                  disabled={busy}
                  placeholder="rma_…"
                />
              </div>
              <Button className="w-full" disabled={busy || !ready}>
                {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
                토큰으로 로그인
              </Button>
            </form>
            {error && (
              <ConsoleNotice variant="destructive">{error}</ConsoleNotice>
            )}
            <a
              href="/"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-3" />
              콘솔로 돌아가기
            </a>
          </ConsolePanel>
        </section>
      </div>
    </main>
  );
}
