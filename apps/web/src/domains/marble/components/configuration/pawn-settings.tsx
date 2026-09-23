"use client";

import { useCallback, useEffect, useState } from "react";
import type { PawnAppearanceDto } from "@rogimarble/contracts";
import { api } from "../../../../../lib/api";
import { Button } from "@/shared/components/ui/button";
import { ConsoleNotice } from "@/shared/components/common/console-ui";
import { PawnImageControl } from "../pawn-image-control";

export function PawnSettings({ active }: { active: boolean }) {
  const [appearance, setAppearance] = useState<PawnAppearanceDto | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setAppearance(await api.currentPawnAppearance());
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "말 설정을 불러오지 못했습니다.");
    }
  }, []);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  return (
    <section className="w-full min-w-0 space-y-4" aria-label="말 디자인 설정">
      {!appearance && !error && (
        <p role="status" className="text-sm text-muted-foreground">
          말 디자인을 불러오는 중입니다.
        </p>
      )}
      {error && (
        <ConsoleNotice variant="warning">
          {error}
          <Button variant="outline" size="sm" onClick={() => void load()}>
            다시 불러오기
          </Button>
        </ConsoleNotice>
      )}
      {appearance && (
        <PawnImageControl
          appearance={appearance}
          disabled={Boolean(error)}
          onChange={setAppearance}
        />
      )}
    </section>
  );
}
