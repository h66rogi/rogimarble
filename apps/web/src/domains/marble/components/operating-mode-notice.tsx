'use client';

import { useEffect, useState } from 'react';
import type { OperatorSnapshot } from '../../../../lib/types';

export function OperatingModeNotice() {
  const [snapshot, setSnapshot] = useState<OperatorSnapshot | null>(null);
  useEffect(() => {
    const update = (event: Event) => setSnapshot((event as CustomEvent<OperatorSnapshot>).detail);
    window.addEventListener('rogimarble:operator-state', update);
    return () => window.removeEventListener('rogimarble:operator-state', update);
  }, []);
  const mode = !snapshot ? '서버 연결 확인 중' : !snapshot.session ? '게임 시작 대기' : snapshot.session.previewOnly ? '효과 없는 검증 세션' : '수동 운영';
  return <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-rose-100 bg-rose-50/70 px-4 py-2 text-xs text-rose-900 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100">
    <span className="font-semibold">주루마블 · {mode}</span>
    <span className="text-rose-800/80 dark:text-rose-200/80">후원 수집 미연결</span>
  </div>;
}
