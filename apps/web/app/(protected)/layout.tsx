"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/components/ui/button";
import { ConsoleNotice, ConsolePanel } from "@/shared/components/common/console-ui";
import { api, ApiError } from "../../lib/api";

type AuthState = "checking" | "authenticated" | "error";

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<AuthState>("checking");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setState("checking");
    void api.bootstrapSession()
      .then(() => {
        if (active) setState("authenticated");
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401) {
          router.replace("/login");
          return;
        }
        setState("error");
      });
    return () => { active = false; };
  }, [router, retry]);

  const tryAgain = useCallback(() => setRetry((current) => current + 1), []);

  if (state === "authenticated") return children;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 text-foreground">
      {state === "error" ? (
        <ConsolePanel title="접속 상태를 확인하지 못했습니다">
          <ConsoleNotice variant="destructive">
            로그인 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.
          </ConsoleNotice>
          <Button onClick={tryAgain}>다시 시도</Button>
        </ConsolePanel>
      ) : (
        <p className="text-sm text-muted-foreground" role="status">
          로그인 상태를 확인하는 중입니다.
        </p>
      )}
    </main>
  );
}
