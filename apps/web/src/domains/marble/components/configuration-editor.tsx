"use client";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Badge } from "@/shared/components/ui/badge";
import { Disclosure } from "./configuration/editor-fields";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, CheckCircle2, Download, Loader2, Save } from "lucide-react";
import { upgradeLegacyOverlayLayout } from "@rogimarble/contracts";
import type {
  ChannelConfigKind,
  ChannelConfigVersionDto,
  OverlayLayoutDto,
} from "@rogimarble/contracts";
import {
  validateBoardDefinition,
  type BoardDefinition,
} from "@rogimarble/game-core/board";
import {
  validateDonationTriggerConfig,
  type DonationTriggerConfig,
} from "@rogimarble/game-core";
import initialRules from "../../../../../../presets/streamer-initial.json";
import initialBoard from "../../../../../../presets/streamer-board.json";
import { api, ApiError } from "../../../../lib/api";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { BoardEditor } from "./configuration/board-editor";
import { RulesEditor } from "./configuration/rules-editor";
import { ItemsEditor, LayoutEditor } from "./configuration/resource-editors";
import type { NamedItem } from "./configuration/editor-model";

const blankLayout: OverlayLayoutDto = {
  schemaVersion: 1,
  width: 1920,
  height: 1080,
  aspectRatio: "16:9",
  background: "transparent",
  widgets: [{ id: "board", bounds: { x: 0, y: 0, width: 1, height: 1 }, z: 0 }],
};
const blank: Record<ChannelConfigKind, unknown> = {
  rules: { schemaVersion: 1, multiRollEnabled: false, items: [], rules: [] },
  items: [],
  board: initialBoard,
  "overlay-layout": blankLayout,
};
export const configLabels: Record<ChannelConfigKind, string> = {
  board: "게임판",
  rules: "후원 규칙",
  items: "아이템",
  "overlay-layout": "방송 테마·배치",
};

export function ConfigurationEditor({
  kind,
  items = [],
  onDirty,
  onItemsPublished,
}: {
  kind: ChannelConfigKind;
  items?: readonly NamedItem[];
  onDirty?: (kind: ChannelConfigKind, dirty: boolean) => void;
  onItemsPublished?: (items: NamedItem[]) => void;
}) {
  const [version, setVersion] = useState<ChannelConfigVersionDto | null>(null);
  const [published, setPublished] = useState<ChannelConfigVersionDto | null>(
    null,
  );
  const [document, setRawDocument] = useState<unknown>(
    structuredClone(blank[kind]),
  );
  const [saved, setSaved] = useState(JSON.stringify(blank[kind]));
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [review, setReview] = useState(false);
  const [presetReview, setPresetReview] = useState(false);
  const request = useRef(0);
  const itemsChanged = useRef(onItemsPublished);
  itemsChanged.current = onItemsPublished;
  const locked = useRef(false);
  const dirty = JSON.stringify(document) !== saved;
  useEffect(() => {
    onDirty?.(kind, dirty);
  }, [dirty, kind, onDirty]);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  const load = useCallback(async () => {
    const seq = ++request.current;
    setBusy(true);
    setError("");
    try {
      const state = await api.config(kind);
      if (seq !== request.current) return;
      const next = structuredClone(
        state.draft?.document ??
          (kind === "overlay-layout" ? state.effectiveDocument : undefined) ??
          state.published?.document ??
          state.effectiveDocument ??
          blank[kind],
      );
      if (kind === "items") {
        const activeItems =
          state.effectiveDocument ?? state.published?.document;
        if (Array.isArray(activeItems))
          itemsChanged.current?.(activeItems as NamedItem[]);
      }
      setVersion(state.draft);
      setPublished(state.published);
      setRawDocument(kind === "overlay-layout" ? upgradeLegacyOverlayLayout(next) : next);
      setSaved(JSON.stringify(next));
      setReady(true);
    } catch (e) {
      if (seq === request.current) setError(textError(e));
    } finally {
      if (seq === request.current) setBusy(false);
    }
  }, [kind]);
  useEffect(() => {
    void load();
    return () => {
      request.current++;
    };
  }, [load]);
  const setDocument = (next: unknown) => {
    setRawDocument(next);
    setMessage("");
    setError("");
    setReview(false);
  };
  const accept = (next: ChannelConfigVersionDto) => {
    setVersion(next.status === "published" ? null : next);
    if (next.status === "published") {
      setPublished(next);
      if (kind === "items") onItemsPublished?.(next.document as NamedItem[]);
    }
    setRawDocument(structuredClone(next.document));
    setSaved(JSON.stringify(next.document));
  };
  const save = async (validate: boolean) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      let next = version;
      if (dirty || !next) {
        next = next
          ? await api.updateConfigDraft(kind, next.id, next.revision, document)
          : await api.createConfigDraft(kind, document);
        accept(next);
      }
      if (validate && next.status !== "validated") {
        next = await api.validateConfig(kind, next.id, next.revision);
        accept(next);
      }
      if (next.validationErrors.length)
        setError(
          "게시하기 전에 아래 항목을 확인해주세요. 초안은 저장되어 있어요.",
        );
      else if (validate) setReview(true);
      else
        setMessage("초안을 저장했어요. 게시하기 전까지 현재 설정은 유지돼요.");
    } catch (e) {
      setError(textError(e));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  const publish = async () => {
    if (!version || version.status !== "validated" || dirty || locked.current)
      return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      const next = await api.publishConfig(kind, version.id, version.revision);
      accept(next);
      setReview(false);
      setMessage(
        kind === "board"
          ? "게임판을 게시했어요. 새 게임을 시작할 때 선택할 수 있어요."
          : "게시했어요. 새로 수락하는 요청부터 사용해요.",
      );
    } catch (e) {
      setError(textError(e));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  const shape = isEditable(kind, document);
  const hasChanges = dirty || !!version || !published;
  const errors = dirty ? [] : (version?.validationErrors ?? []);
  return (
    <section
      className="space-y-5 min-w-0"
      aria-label={`${configLabels[kind]} 설정`}
    >
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">
            {kind === "board"
              ? "내 게임판 만들기"
              : kind === "rules"
                ? "후원과 동작 연결하기"
                : configLabels[kind]}
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {kind === "board"
              ? "칸을 고르고, 동작을 정하고, 나만의 판을 완성하세요."
              : kind === "rules"
                ? "후원 개수와 동작을 한눈에 확인하고 편집하세요."
                : kind === "items"
                  ? "방송에서 사용할 보상과 실드를 관리하세요."
                  : "방송 화면의 기본 스타일과 패널 내용을 편집하세요."}
          </p>
        </div>
        {(kind === "rules" || kind === "board" || kind === "items") && (
          <Button
            variant="outline"
            disabled={!ready || busy}
            onClick={() => setPresetReview(true)}
          >
            <Download />
            기본 구성 가져오기
          </Button>
        )}
      </header>
      {!ready ? (
        <div
          className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center text-sm text-muted-foreground"
          role="status"
        >
          {busy ? (
            <>
              <Loader2 className="animate-spin" />
              <p className="text-sm leading-relaxed text-muted-foreground">
                저장된 설정을 불러오고 있어요.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" onClick={() => void load()}>
                다시 불러오기
              </Button>
            </>
          )}
        </div>
      ) : (
        <>
          {!shape ? (
            <div className="text-sm text-destructive" role="alert">
              저장된 데이터에 지원하지 않는 형식이 있어 편집기를 열 수 없어요.
              기본 구성 가져오기에서 새 초안을 시작할 수 있어요.
              <Disclosure title={<>저장 데이터 확인</>}>
                <pre>{JSON.stringify(document, null, 2)}</pre>
              </Disclosure>
            </div>
          ) : (
            <fieldset disabled={busy} className="min-w-0 disabled:opacity-60">
              {kind === "board" ? (
                <BoardEditor
                  value={document as BoardDefinition}
                  items={items}
                  change={setDocument}
                />
              ) : kind === "rules" ? (
                <RulesEditor
                  value={document as DonationTriggerConfig}
                  items={items}
                  change={setDocument}
                />
              ) : kind === "items" ? (
                <ItemsEditor
                  value={document as NamedItem[]}
                  change={setDocument}
                />
              ) : (
                <LayoutEditor
                  value={document as OverlayLayoutDto}
                  change={setDocument}
                />
              )}
            </fieldset>
          )}
          {(error || errors.length > 0) && (
            <Alert role="alert">
              <AlertDescription className="space-y-2">
                <strong className="font-semibold">
                  {error || "입력을 확인해주세요."}
                </strong>
                {errors.map((e, i) => (
                  <p
                    className="text-sm leading-relaxed text-muted-foreground"
                    key={i}
                  >
                    {friendlyValidation(e)}
                  </p>
                ))}
                {errors.length > 0 && (
                  <Disclosure title={<>검사 상세</>}>
                    {errors.map((e, i) => (
                      <code key={i}>{e}</code>
                    ))}
                  </Disclosure>
                )}
              </AlertDescription>
            </Alert>
          )}
          <footer className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-4 border-t bg-background/95 px-4 py-3 backdrop-blur">
            <div>
              <Badge variant="secondary">
                {dirty
                  ? "저장하지 않은 변경"
                  : version?.status === "validated"
                    ? "검사 완료 · 게시 가능"
                    : version
                      ? "초안 저장됨"
                      : published
                        ? "게시된 설정"
                        : "새 초안"}
              </Badge>
              <p
                className="text-sm leading-relaxed text-muted-foreground"
                role="status"
              >
                {message ||
                  (kind === "board"
                    ? "게시한 판은 새 게임에서 선택할 수 있어요. 현재 게임은 유지돼요."
                    : "게시한 뒤 새로 들어오는 요청부터 반영돼요.")}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button
                variant="outline"
                disabled={busy || !shape || (!dirty && !!version)}
                onClick={() => void save(false)}
              >
                <Save />
                초안 저장
              </Button>
              <Button
                disabled={busy || !shape || !hasChanges}
                onClick={() => void save(true)}
              >
                {busy ? (
                  <Loader2 className="animate-spin" />
                ) : !hasChanges ? (
                  <Check />
                ) : (
                  <CheckCircle2 />
                )}
                {busy ? "처리 중…" : !hasChanges ? "게시됨" : "검사하고 게시"}
              </Button>
            </div>
          </footer>
        </>
      )}
      <Dialog
        open={review}
        onOpenChange={(open) => {
          if (!busy) setReview(open);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{configLabels[kind]}을 게시할까요?</DialogTitle>
            <DialogDescription>
              서버 검사를 통과했어요. 아래 내용을 확인한 뒤 게시해주세요.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-3">
            <CheckCircle2 />
            <strong className="font-semibold">{summary(kind, document)}</strong>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {kind === "board"
                ? "새 게임을 시작할 때 이 판을 선택할 수 있어요. 진행 중인 게임의 위치·미션·아이템은 바뀌지 않아요."
                : kind === "rules"
                  ? "게시 후 새로 수락하는 후원에 적용해요. 이미 대기 중인 요청은 이전 규칙을 유지해요."
                  : kind === "items"
                    ? "게시하면 후원 규칙과 칸 동작에서 이 아이템을 선택할 수 있어요."
                    : "방송 테마와 배치가 운영 화면·OBS에 반영돼요. 게임 진행 상태는 유지돼요."}
            </p>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setReview(false)}
            >
              계속 편집
            </Button>
            <Button disabled={busy} onClick={() => void publish()}>
              {busy ? "게시 중…" : "게시하기"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={presetReview} onOpenChange={setPresetReview}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>기본 구성을 가져올까요?</DialogTitle>
            <DialogDescription>
              편집 중인 {configLabels[kind]} 전체를 아래 구성으로 바꿔요. 게시된
              설정은 게시하기 전까지 유지돼요.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-3">
            <strong className="font-semibold">
              {kind === "board"
                ? "가로 9 × 세로 6 · 외곽 26칸"
                : kind === "rules"
                  ? "후원 규칙 7개"
                  : "기본 아이템 · 한잔 실드"}
            </strong>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {kind === "board"
                ? "출발·무인도·세계여행·방향전환과 방송 미션을 포함한 기본 판이에요."
                : kind === "rules"
                  ? "33 · 52 · 53 · 100 · 101 · 152 · 486개 규칙을 가져와요. 한잔 실드 아이템을 먼저 등록·게시해주세요."
                  : "기본 후원 규칙에서 사용하는 실드예요. 기존 아이템 목록을 교체하니 사용 중인 항목을 확인해주세요."}
            </p>
            <span className="text-xs leading-relaxed text-muted-foreground">
              현재: {summary(kind, document)}
            </span>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPresetReview(false)}>
              취소
            </Button>
            <Button
              onClick={() => {
                setDocument(
                  structuredClone(
                    kind === "board"
                      ? initialBoard
                      : kind === "rules"
                        ? initialRules
                        : initialRules.items,
                  ),
                );
                setPresetReview(false);
                setMessage(
                  "기본 구성을 가져왔어요. 초안을 저장하고 확인해주세요.",
                );
              }}
            >
              이 구성으로 바꾸기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
function summary(kind: ChannelConfigKind, value: unknown): string {
  if (!isEditable(kind, value)) return "설정 형식 확인 필요";
  if (kind === "board") {
    const b = value as BoardDefinition;
    return `${b.name} · ${b.path.length}칸 · 주사위 ${b.dice.count}개`;
  }
  if (kind === "rules") {
    const r = value as DonationTriggerConfig;
    return `후원 규칙 ${r.rules.length}개 · 사용 중 ${r.rules.filter((x) => x.enabled).length}개`;
  }
  if (kind === "items") return `아이템 ${(value as NamedItem[]).length}개`;
  const l = value as OverlayLayoutDto;
  return `${l.width} × ${l.height} · 표시 영역 ${l.widgets.length}개`;
}
function textError(error: unknown) {
  return error instanceof ApiError && error.status === 409
    ? "다른 곳에서 설정이 변경됐어요. 입력한 내용은 유지했습니다. 새로고침 전에 변경 내용을 확인해주세요."
    : error instanceof Error
      ? error.message
      : "요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.";
}
function friendlyValidation(message: string) {
  if (/unconfigured|Unconfirmed|unconfirmed/i.test(message))
    return "아직 정하지 않은 칸 동작이 있어요. 해당 칸에서 동작을 선택해주세요.";
  if (/unknown.*item|item.*unknown|active item/i.test(message))
    return "연결한 아이템이 등록되지 않았어요. 아이템 탭에서 등록·게시한 뒤 다시 선택해주세요.";
  if (/amount|duplicate/i.test(message))
    return "후원 개수·고유 번호가 중복되거나 올바르지 않아요. 각 규칙을 확인해주세요.";
  if (/color/i.test(message)) return "칸 또는 배경 색상을 확인해주세요.";
  if (/dice/i.test(message))
    return "주사위 개수·면 수와 관련 동작의 값을 확인해주세요.";
  if (/position|grid|layout|rect|bounds|canvas|width|height/i.test(message))
    return "화면 크기와 칸·표시 영역의 위치가 올바른지 확인해주세요.";
  if (/counter/i.test(message))
    return "적립 항목과 칸에 연결한 적립·청산 동작을 확인해주세요.";
  return "비어 있는 문구, 수량, 연결된 칸·아이템·동작을 확인해주세요.";
}
function isEditable(kind: ChannelConfigKind, value: unknown): boolean {
  if (kind === "board") {
    try {
      validateBoardDefinition(value);
      return true;
    } catch {
      /* Incomplete drafts remain editable when they have a safe structural shape. */
    }
  }
  if (kind === "rules") {
    try {
      validateDonationTriggerConfig(value);
      return true;
    } catch {
      /* Allow incomplete form values. */
    }
  }
  const v = value as any;
  const object = (x: any) => x && typeof x === "object" && !Array.isArray(x);
  const item = (x: any) =>
    object(x) && typeof x.id === "string" && typeof x.label === "string";
  const effects = (list: any) =>
    Array.isArray(list) &&
    list.every(
      (e) =>
        object(e) &&
        (e.type === "movement_lock"
          ? object(e.release) &&
            (e.release.type !== "dice_faces" || Array.isArray(e.release.faces))
          : e.type === "modify_roll"
            ? object(e.modifier)
            : e.type === "choice_mission"
              ? Array.isArray(e.choices)
              : e.type === "choose_destination"
                ? e.allowedCellIds === null || Array.isArray(e.allowedCellIds)
                : [
                    "none",
                    "mission",
                    "move_steps",
                    "set_direction",
                    "counter_add",
                    "counter_settle",
                    "grant_item",
                    "unconfigured",
                  ].includes(e.type)),
    );
  if (kind === "items") return Array.isArray(v) && v.every(item);
  if (!object(v) || v.schemaVersion !== 1) return false;
  if (kind === "rules")
    return (
      Array.isArray(v.items) &&
      v.items.every(item) &&
      Array.isArray(v.rules) &&
      v.rules.every(
        (r: any) =>
          item(r) &&
          typeof r.amount === "number" &&
          object(r.action) &&
          ["roll_dice", "mission", "grant_item", "choose_destination"].includes(
            r.action.type,
          ),
      )
    );
  if (kind === "board")
    return (
      typeof v.name === "string" &&
      object(v.canvas) &&
      typeof v.canvas.width === "number" &&
      typeof v.canvas.height === "number" &&
      object(v.layout) &&
      object(v.dice) &&
      Array.isArray(v.widgets) &&
      v.widgets.every((w: any) => object(w) && object(w.bounds)) &&
      Array.isArray(v.counters) &&
      Array.isArray(v.path) &&
      v.path.length > 0 &&
      Array.isArray(v.cells) &&
      v.path.every((id: string) => v.cells.some((c: any) => c.id === id)) &&
      v.cells.every(
        (c: any) =>
          item(c) &&
          object(c.position) &&
          object(c.appearance) &&
          effects(c.onLand) &&
          effects(c.onPass),
      )
    );
  return (
    Array.isArray(v.widgets) &&
    v.widgets.every((w: any) => object(w) && object(w.bounds))
  );
}
