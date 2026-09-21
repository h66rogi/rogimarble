'use client';

import { useEffect, useState } from 'react';
import type { OperatorSnapshot } from '../../../../lib/types';
import { api, type CollectorStatus } from '../../../../lib/api';

export function OperatingModeNotice() {
  const [snapshot, setSnapshot] = useState<OperatorSnapshot | null>(null);
  const [collector,setCollector]=useState<CollectorStatus|null>(null);
  useEffect(() => {
    const update = (event: Event) => setSnapshot((event as CustomEvent<OperatorSnapshot>).detail);
    window.addEventListener('rogimarble:operator-state', update);
    return () => window.removeEventListener('rogimarble:operator-state', update);
  }, []);
  useEffect(()=>{let alive=true;const update=()=>void api.collectorStatus().then(value=>{if(alive)setCollector(value);}).catch(()=>{if(alive)setCollector(null);});update();const timer=setInterval(update,5000);return()=>{alive=false;clearInterval(timer);};},[]);
  const mode = !snapshot ? '서버 연결 확인 중' : !snapshot.session ? '게임 시작 대기' : snapshot.session.previewOnly ? '효과 없는 검증 세션' : collector?.transport==='connected'?'방송 운영':'수동 운영';
  const collection=!collector?'수집 연결 확인 중':!collector.enabled?'후원 수집 미연결':collector.transport==='recovery_required'?'후원 수집 복구 확인 필요':collector.transport!=='connected'?'후원 수집 연결 재시도 중':collector.collectionActive?'후원 수집 중':({waiting:'방송 시작 대기',disabled:'수집 중지',cookie_required:'수집 로그인 확인 필요',auth_required:'수집 로그인 확인 필요',reconnecting:'방송 재연결 중'} as Record<string,string>)[collector.collectionState]??'수집 상태 확인 중';
  const pending=(collector?.counts?.pending??0)+(collector?.counts?.held??0)+(collector?.counts?.failed??0);
  return <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-rose-100 bg-rose-50/70 px-4 py-2 text-xs text-rose-900 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100">
    <span className="font-semibold">주루마블 · {mode}</span>
    <span className="text-rose-800/80 dark:text-rose-200/80">{collection}{pending?` · 확인할 후원 ${pending}건`:''}</span>
  </div>;
}
