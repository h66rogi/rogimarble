'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BoardFontId, BoardThemeId, BroadcastDonationRule, OverlayLayoutDto, OverlayLayoutSnapshotDto, OverlayWidgetId, OverlayWidgetStyleDto } from '@rogimarble/contracts';
import type { BoardDefinition } from '@rogimarble/game-core/board';
import type { DonationTriggerConfig } from '@rogimarble/game-core';
import { api } from '@/lib/api';
import { LiveLayoutError, liveLayoutApi } from '@/lib/live-layout';
import { ConsoleNotice } from '@/shared/components/common/console-ui';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Label } from '@/shared/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { BOARD_FONTS, BOARD_THEMES } from '@rogimarble/overlay-ui';
import { OVERLAY_PARTS } from '../overlay-parts';
import { TotalOverlayLayoutSettings, type TotalOverlayLayoutAdapter } from '@/domains/overlay/components/total-overlay-layout-settings';
import { DEFAULT_MARBLE_TOTAL_OVERLAY_LAYOUT, type TotalOverlayLayout, type TotalOverlayWidgetId } from '@/domains/overlay/constants/total-layout';
import { OverlayWidgetPreview } from './configuration/board-preview';

const WIDGET_IDS: readonly TotalOverlayWidgetId[] = ['board', 'direction', 'inventory', 'current_mission', 'dice', 'menu', 'dice_price'];

function toEditorLayout(layout: OverlayLayoutDto): TotalOverlayLayout {
  const byId = new Map(layout.widgets.map((widget) => [widget.id, widget]));
  return {
    version: layout.schemaVersion,
    aspect: layout.aspectRatio,
    widgets: DEFAULT_MARBLE_TOTAL_OVERLAY_LAYOUT.widgets.map((fallback) => {
      const widget = byId.get(fallback.id as OverlayWidgetId);
      return widget ? {
        id: widget.id,
        enabled: true,
        x: widget.bounds.x,
        y: widget.bounds.y,
        w: widget.bounds.width,
        h: widget.bounds.height,
        z: widget.z,
      } : { ...fallback, enabled: false };
    }),
  };
}

function toApiLayout(editor: TotalOverlayLayout, source: OverlayLayoutDto): OverlayLayoutDto {
  return {
    ...source,
    widgets: editor.widgets.filter((widget) => widget.enabled).map((widget) => ({
      id: widget.id as OverlayWidgetId,
      bounds: { x: widget.x, y: widget.y, width: widget.w, height: widget.h },
      z: widget.z,
    })),
  };
}

export function LiveLayoutEditor() {
  const [snapshot, setSnapshot] = useState<OverlayLayoutSnapshotDto | null>(null);
  const snapshotRef = useRef<OverlayLayoutSnapshotDto | null>(null);
  const operatorRoleRef = useRef<'admin' | 'operator' | 'viewer'>('viewer');
  const [board, setBoard] = useState<BoardDefinition | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [rules, setRules] = useState<readonly BroadcastDonationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [savingStyle, setSavingStyle] = useState<OverlayWidgetId | null>(null);

  const applySnapshot = useCallback((next: OverlayLayoutSnapshotDto) => {
    const current = snapshotRef.current;
    if (!current || next.layoutVersion > current.layoutVersion) {
      snapshotRef.current = next;
      setSnapshot(next);
    }
    if ((!current || next.layoutVersion >= current.layoutVersion) && next.canEdit !== undefined) {
      setCanEdit(operatorRoleRef.current !== 'viewer' && next.canEdit === true);
    }
  }, []);

  const refresh = useCallback(async () => {
    const next = await liveLayoutApi.get();
    applySnapshot(next);
    return next;
  }, [applySnapshot]);

  const applyRules = useCallback((ruleState: Awaited<ReturnType<typeof api.config>>) => {
    const config = (ruleState.published?.document ?? ruleState.effectiveDocument) as DonationTriggerConfig | undefined;
    setRules(config?.rules.filter(rule => rule.enabled && (rule.action.type !== 'roll_dice' || rule.action.rollCount === 1 || config.multiRollEnabled)).map(rule => ({
      id: rule.id,
      label: rule.label,
      amount: rule.amount,
      ...(rule.action.type === 'roll_dice' ? { rollCount: rule.action.rollCount } : {}),
    })) ?? []);
  }, []);

  useEffect(() => {
    let alive = true;
    void Promise.all([liveLayoutApi.get(), liveLayoutApi.session(), api.snapshot(), api.config('rules')])
      .then(([next, session, state, ruleState]) => {
        if (!alive) return;
        operatorRoleRef.current = session.operator.role;
        applySnapshot(next);
        setBoard(state.boardDefinition as BoardDefinition | null);
        applyRules(ruleState);
      })
      .catch((error) => alive && setMessage(error instanceof Error ? error.message : '실시간 배치를 불러오지 못했습니다.'))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [applyRules, applySnapshot]);

  useEffect(() => {
    if (loading) return;
    let alive = true;
    let pending = false;
    const poll = async () => {
      if (pending || document.visibilityState !== 'visible') return;
      pending = true;
      try {
        const next = await liveLayoutApi.get();
        if (alive) applySnapshot(next);
      } catch {
        // A transient background read does not replace the last authoritative layout.
      } finally {
        pending = false;
      }
    };
    const focus = () => {
      void poll();
      void api.config('rules').then(value => { if (alive) applyRules(value); }).catch(() => undefined);
    };
    const visibility = () => { if (document.visibilityState === 'visible') focus(); };
    const timer = window.setInterval(() => void poll(), 2000);
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [applyRules, applySnapshot, loading]);

  const save = useCallback(async (editor: TotalOverlayLayout, expectedVersion: number) => {
    const current = snapshotRef.current;
    if (!current) throw new Error('실시간 배치를 먼저 불러와 주세요.');
    try {
      const saved = await liveLayoutApi.put(toApiLayout(editor, current.layout), expectedVersion);
      applySnapshot(saved);
      setMessage('');
      return { layout: toEditorLayout(saved.layout), layoutVersion: saved.layoutVersion };
    } catch (error) {
      if (error instanceof LiveLayoutError && error.status === 409) {
        await refresh();
        setMessage('다른 운영자의 최신 배치를 불러왔습니다. 변경 내용을 다시 확인해 주세요.');
      } else {
        setMessage(error instanceof Error ? error.message : '실시간 배치를 저장하지 못했습니다.');
      }
      throw error;
    }
  }, [applySnapshot, refresh]);

  const renderWidget = useCallback((id: TotalOverlayWidgetId) => {
    const layout = snapshotRef.current?.layout;
    if (!layout) return null;
    return <OverlayWidgetPreview id={id as OverlayWidgetId} value={layout} board={board ?? undefined} rules={rules} />;
  }, [board, rules]);

  const updateStyle = useCallback(async (id: OverlayWidgetId, key: keyof OverlayWidgetStyleDto, value: string) => {
    const current = snapshotRef.current;
    if (!current || !canEdit) return;
    const oldStyle = current.layout.widgetStyles?.[id] ?? {};
    const nextStyle = { ...oldStyle, [key]: value === 'inherit' ? undefined : value };
    const widgetStyles = { ...current.layout.widgetStyles, [id]: nextStyle };
    setSavingStyle(id);
    try {
      const saved = await liveLayoutApi.put({ ...current.layout, widgetStyles }, current.layoutVersion);
      applySnapshot(saved);
      setMessage('');
    } catch (error) {
      if (error instanceof LiveLayoutError && error.status === 409) {
        await refresh();
        setMessage('다른 운영자의 최신 설정을 불러왔습니다. 스타일을 다시 선택해 주세요.');
      } else {
        setMessage(error instanceof Error ? error.message : '파츠 스타일을 저장하지 못했습니다.');
      }
    } finally {
      setSavingStyle(null);
    }
  }, [applySnapshot, canEdit, refresh]);

  const adapter = useMemo<TotalOverlayLayoutAdapter | null>(() => snapshot ? ({
    snapshot: { layout: toEditorLayout(snapshot.layout), layoutVersion: snapshot.layoutVersion },
    isLoading: loading,
    canEdit,
    widgetIds: WIDGET_IDS,
    canvasAspect: snapshot.layout.width / snapshot.layout.height,
    save,
    renderWidget,
  }) : null, [canEdit, loading, renderWidget, save, snapshot]);

  if (!adapter && !loading) return <ConsoleNotice variant="warning">{message || '실시간 배치를 불러오지 못했습니다.'}</ConsoleNotice>;

  return <div className="space-y-3">
    {message && <ConsoleNotice variant="warning"><span>{message}</span><Button size="sm" variant="outline" disabled={loading} onClick={() => void refresh().catch(error => setMessage(error instanceof Error ? error.message : '실시간 배치를 불러오지 못했습니다.'))}>최신 배치 다시 불러오기</Button></ConsoleNotice>}
    {!canEdit && !loading && <ConsoleNotice>보기 권한에서는 실시간 배치를 변경할 수 없습니다.</ConsoleNotice>}
    <TotalOverlayLayoutSettings
      user="marble-live"
      overlayToken={null}
      isTokenLoading={loading}
      embedded
      defaultLayout={DEFAULT_MARBLE_TOTAL_OVERLAY_LAYOUT}
      widgetPreviewEnabled={false}
      adapter={adapter ?? { snapshot: null, isLoading: true, canEdit: false, widgetIds: WIDGET_IDS, canvasAspect: 16 / 9, save, renderWidget }}
    />
    {snapshot && <section className="space-y-3" aria-label="파츠별 방송 스타일">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">파츠별 방송 스타일</h3>
        <p className="text-xs text-muted-foreground">테마와 글꼴을 선택하면 통합 화면과 개별 OBS 주소에 바로 반영됩니다. 전체 설정을 선택하면 게시된 기본값을 사용합니다.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {OVERLAY_PARTS.map((part) => {
          const style = snapshot.layout.widgetStyles?.[part.id];
          return <Card key={part.id}><CardContent className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">{part.label} 스타일</h4>
              <span className="text-xs text-muted-foreground">{part.width} × {part.height}px</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Label className="block space-y-1">테마
                <Select value={style?.themeId ?? 'inherit'} disabled={!canEdit || savingStyle !== null} onValueChange={(value) => void updateStyle(part.id, 'themeId', value as BoardThemeId | 'inherit')}>
                  <SelectTrigger aria-label={`${part.label} 테마`}><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="inherit">전체 설정</SelectItem>{BOARD_THEMES.map((theme) => <SelectItem key={theme.id} value={theme.id}>{theme.name}</SelectItem>)}</SelectContent>
                </Select>
              </Label>
              <Label className="block space-y-1">글꼴
                <Select value={style?.fontId ?? 'inherit'} disabled={!canEdit || savingStyle !== null} onValueChange={(value) => void updateStyle(part.id, 'fontId', value as BoardFontId | 'inherit')}>
                  <SelectTrigger aria-label={`${part.label} 글꼴`}><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="inherit">전체 설정</SelectItem>{BOARD_FONTS.map((font) => <SelectItem key={font.id} value={font.id}>{font.name}</SelectItem>)}</SelectContent>
                </Select>
              </Label>
            </div>
          </CardContent></Card>;
        })}
      </div>
    </section>}
  </div>;
}
