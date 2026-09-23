"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { MessageSquareText, ReceiptText } from "lucide-react";
import type { ChatEventDto, DonationEventDto } from "@rogimarble/contracts";
import { api } from "../../../../lib/api";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";
import { ConsoleDetails, ConsoleNotice, ConsoleSelect } from "@/shared/components/common/console-ui";

type FeedKind = "donation" | "chat";
type FeedRow = {
  id: string; kind: FeedKind; occurredAt: string; receivedAt?: string;
  name: string; userId?: string; message: string; amount?: number;
  result?: DonationEventDto["result"]; resultDetail?: unknown; ruleId?: string | null;
  matchedTaskId?: string | null; gapBefore?: boolean;
};
const resultNames: Record<DonationEventDto["result"], string> = {
  matched: "규칙 일치", no_match: "규칙 없음", failed: "처리 실패",
  pending: "처리 대기", held: "확인 필요", ignored: "게임 미적용",
};
const asDonation = (item: DonationEventDto): FeedRow => ({
  id: item.id, kind: "donation", occurredAt: item.occurredAt,
  name: item.donorDisplayName, message: item.message ?? "", amount: item.amount,
  result: item.result, resultDetail: item.resultDetail, ruleId: item.ruleId,
});
const asChat = (item: ChatEventDto): FeedRow => ({
  id: item.id, kind: "chat", occurredAt: item.occurredAt,
  receivedAt: item.receivedAt, name: item.userDisplayName, userId: item.userId,
  message: item.message, matchedTaskId: item.matchedTaskId, gapBefore: item.gapBefore,
});
function formatDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) ? date.toLocaleString("ko-KR") : "";
}
function mergeRows(fresh: readonly FeedRow[], previous: readonly FeedRow[]) {
  const ids = new Set(fresh.map((item) => item.id));
  return [...fresh, ...previous.filter((item) => !ids.has(item.id))];
}

export function MarbleDonationsSection() {
  const [kind, setKind] = useState<FeedKind>("donation");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState("");
  const [resultQuery, setResultQuery] = useState("");
  const [rows, setRows] = useState<FeedRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [streamConnected, setStreamConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [followLatest, setFollowLatest] = useState(true);
  const [newCount, setNewCount] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const sequence = useRef(0);
  const busy = useRef(false);
  const rowsRef = useRef<FeedRow[]>([]);
  const cursorRef = useRef<string | null>(null);
  const pendingFresh = useRef<FeedRow[]>([]);
  const followLatestRef = useRef(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { followLatestRef.current = followLatest; }, [followLatest]);

  const load = useCallback(async (mode: "reset" | "refresh" | "more") => {
    if (busy.current || (mode === "more" && !cursorRef.current)) return;
    busy.current = true;
    const request = sequence.current;
    if (mode === "reset") setLoading(true);
    if (mode === "more") setLoadingMore(true);
    try {
      const page = kind === "donation"
        ? await api.donations({ ...(query ? { donor: query } : {}),
            ...(resultQuery ? { result: resultQuery } : {}),
            ...(mode === "more" && cursorRef.current ? { cursor: cursorRef.current } : {}) })
        : await api.chats({ ...(query ? { search: query } : {}),
            ...(mode === "more" && cursorRef.current ? { cursor: cursorRef.current } : {}) });
      if (request !== sequence.current) return;
      const fresh = kind === "donation"
        ? (page.items as readonly DonationEventDto[]).map(asDonation)
        : (page.items as readonly ChatEventDto[]).map(asChat);
      setConnected(page.collectionConnected);
      if (mode === "reset") {
        rowsRef.current = fresh;
        cursorRef.current = page.nextCursor;
        setCursor(page.nextCursor);
        pendingFresh.current = [];
        setNewCount(0);
        scrollRef.current?.scrollTo({ top: 0 });
      } else if (mode === "more") {
        rowsRef.current = mergeRows(rowsRef.current, fresh);
        cursorRef.current = page.nextCursor;
        setCursor(page.nextCursor);
      } else if (followLatestRef.current) {
        rowsRef.current = mergeRows(fresh, rowsRef.current);
        pendingFresh.current = [];
        setNewCount(0);
        if (!cursorRef.current) { cursorRef.current = page.nextCursor; setCursor(page.nextCursor); }
      } else {
        const known = new Set(rowsRef.current.map((item) => item.id));
        pendingFresh.current = mergeRows(fresh.filter((item) => !known.has(item.id)), pendingFresh.current);
        setNewCount(pendingFresh.current.length);
        const updates = new Map(fresh.map((item) => [item.id, item]));
        rowsRef.current = rowsRef.current.map((item) => updates.get(item.id) ?? item);
      }
      setRows(rowsRef.current);
      setError("");
    } catch (cause) {
      if (request === sequence.current)
        setError(cause instanceof Error ? cause.message : "내역을 불러오지 못했습니다.");
    } finally {
      if (request === sequence.current) {
        busy.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [kind, query, resultQuery]);

  useEffect(() => {
    sequence.current += 1;
    busy.current = false;
    rowsRef.current = [];
    cursorRef.current = null;
    setRows([]);
    setCursor(null);
    setSelectedId(null);
    setConnected(null);
    setStreamConnected(false);
    void load("reset");
    const stream = new EventSource(api.feedEventsUrl(), { withCredentials: true });
    let open = false;
    let ticks = 0;
    stream.onopen = () => { open = true; setStreamConnected(true); void load("refresh"); };
    stream.onerror = () => { open = false; setStreamConnected(false); };
    const onUpdate = (event: Event) => {
      if ((event as MessageEvent).data === kind) void load("refresh");
    };
    stream.addEventListener("feed.updated", onUpdate);
    const timer = window.setInterval(() => {
      ticks += 1;
      if (!document.hidden && (!open || ticks % 5 === 0)) void load("refresh");
    }, 2000);
    const onVisible = () => { if (!document.hidden) void load("refresh"); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      stream.removeEventListener("feed.updated", onUpdate);
      stream.close();
      sequence.current += 1;
    };
  }, [load]);

  const columns = useMemo<ColumnDef<FeedRow>[]>(() => [
    { id: "time", header: "시각", cell: ({ row }) =>
      <time title={formatDate(row.original.occurredAt)}>{new Date(row.original.occurredAt).toLocaleTimeString("ko-KR")}</time> },
    { id: "name", header: kind === "chat" ? "작성자" : "후원자", cell: ({ row }) =>
      <span className="block max-w-32 truncate" title={row.original.name}>{row.original.name}</span> },
    { id: "message", header: "내용", cell: ({ row }) =>
      <span className="block max-w-72 truncate" title={row.original.message}>{row.original.message || "—"}</span> },
    { id: "state", header: kind === "chat" ? "연결" : "별풍선 · 처리", cell: ({ row }) =>
      row.original.kind === "chat"
        ? row.original.matchedTaskId ? <Badge variant="secondary">요청 반영</Badge> : <span className="text-muted-foreground">채팅</span>
        : <span className="whitespace-nowrap">{row.original.amount?.toLocaleString()}개 · {row.original.result ? resultNames[row.original.result] : ""}</span> },
    { id: "detail", header: "상세", cell: ({ row }) =>
      <Button size="sm" variant="ghost" aria-label={`${row.original.name} 상세`} onClick={() =>
        setSelectedId((current) => current === row.original.id ? null : row.original.id)}>보기</Button> },
  ], [kind]);
  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel(), getRowId: (row) => row.id });
  const selected = rows.find((row) => row.id === selectedId);

  return <section aria-label="실시간 채팅과 후원 내역" className="flex h-full min-h-0 flex-col border-t bg-background">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
      <Tabs value={kind} onValueChange={(value) => {
        setKind(value as FeedKind); setSearch(""); setQuery(""); setResult(""); setResultQuery("");
        setFollowLatest(true);
      }}>
        <TabsList>
          <TabsTrigger value="donation"><ReceiptText aria-hidden="true" />후원 내역</TabsTrigger>
          <TabsTrigger value="chat"><MessageSquareText aria-hidden="true" />채팅 내역</TabsTrigger>
        </TabsList>
      </Tabs>
      <span className="text-xs text-muted-foreground">{connected === null ? "연결 확인 중" : connected ? streamConnected ? "수집 중 · 실시간 연결" : "수집 중 · 재연결 중" : "수집 연결 확인 필요"}</span>
    </div>
    <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
      <form className="flex min-w-0 flex-1 flex-wrap gap-2" onSubmit={(event) => {
        event.preventDefault(); setQuery(search.trim()); setResultQuery(kind === "donation" ? result : "");
        if (search.trim() === query && (kind === "chat" || result === resultQuery)) void load("reset");
      }}>
        <Input className="min-w-32 flex-1" aria-label={kind === "chat" ? "채팅 검색" : "후원자 검색"}
          placeholder={kind === "chat" ? "작성자 또는 메시지" : "후원자 이름"}
          value={search} onChange={(event) => setSearch(event.target.value)} />
        {kind === "donation" && <ConsoleSelect aria-label="처리 결과" value={result}
          onValueChange={setResult} options={[{ value: "", label: "전체 결과" },
            ...Object.entries(resultNames).map(([value, label]) => ({ value, label }))]} />}
        <Button size="sm" variant="outline" type="submit">조회</Button>
      </form>
      <Button size="sm" variant={followLatest ? "secondary" : "outline"}
        onClick={() => setFollowLatest((value) => !value)} aria-pressed={followLatest}>
        {followLatest ? "실시간 반영 중" : "실시간 반영 멈춤"}
      </Button>
      {newCount > 0 && <Button size="sm" onClick={() => {
        rowsRef.current = mergeRows(pendingFresh.current, rowsRef.current);
        setRows(rowsRef.current); pendingFresh.current = []; setNewCount(0);
        scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      }}>새 내역 {newCount}건</Button>}
    </div>
    {error && <ConsoleNotice variant="warning">{error}</ConsoleNotice>}
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
      <Table className="min-w-[560px] table-fixed">
        <TableHeader className="sticky top-0 z-10 bg-background">
          {table.getHeaderGroups().map((group) => <TableRow key={group.id}>
            {group.headers.map((header) => <TableHead key={header.id}>
              {flexRender(header.column.columnDef.header, header.getContext())}
            </TableHead>)}
          </TableRow>)}
        </TableHeader>
        <TableBody>{table.getRowModel().rows.map((row) => <TableRow key={row.id}
          data-state={selectedId === row.id ? "selected" : undefined}>
          {row.getVisibleCells().map((cell) => <TableCell key={cell.id}>
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </TableCell>)}
        </TableRow>)}</TableBody>
      </Table>
      {!loading && !rows.length && <p className="p-3 text-sm text-muted-foreground">
        {kind === "chat" ? "표시할 채팅이 없습니다." : "표시할 후원이 없습니다."}
      </p>}
      {loading && <p className="p-3 text-sm text-muted-foreground">내역을 불러오는 중입니다.</p>}
      {cursor && <div className="p-3"><Button size="sm" variant="outline" disabled={loadingMore}
        onClick={() => void load("more")}>{loadingMore ? "불러오는 중…" : "이전 내역 더 보기"}</Button></div>}
    </div>
    {selected && <div className="max-h-40 space-y-1 overflow-auto border-t p-3 text-sm">
      <div className="flex items-center justify-between gap-2"><strong>{selected.name}</strong>
        <Button size="sm" variant="ghost" onClick={() => setSelectedId(null)}>닫기</Button></div>
      <p className="whitespace-pre-wrap break-words">{selected.message || "메시지 없음"}</p>
      <p className="text-xs text-muted-foreground">발생 {formatDate(selected.occurredAt)}
        {selected.receivedAt ? ` · 수신 ${formatDate(selected.receivedAt)}` : ""}
        {selected.ruleId ? ` · 규칙 ${selected.ruleId}` : ""}
        {selected.userId ? ` · 사용자 ID ${selected.userId}` : ""}
      </p>
      {selected.gapBefore && <p className="text-xs text-muted-foreground">이 채팅 전에 수집 공백이 감지되었습니다.</p>}
      {selected.resultDetail != null && <ConsoleDetails title="처리 상세">
        {typeof selected.resultDetail === "string" ? selected.resultDetail : JSON.stringify(selected.resultDetail, null, 2)}
      </ConsoleDetails>}
    </div>}
  </section>;
}
