"use client";

import { useCallback, useEffect, useState } from "react";
import { Gift, Grid2X2, HeartHandshake, Monitor, UserRound } from "lucide-react";
import type { ChannelConfigKind } from "@rogimarble/contracts";
import { api } from "../../../../../lib/api";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/shared/components/ui/tabs";
import { Badge } from "@/shared/components/ui/badge";
import { ConfigurationEditor, configLabels } from "../configuration-editor";
import type { NamedItem } from "./editor-model";
import { PawnSettings } from "./pawn-settings";

export type ConfigurationSection = "rules" | "board";
type WorkspaceTab = ChannelConfigKind | "pawn";
const sections = {
  rules: [["rules", HeartHandshake], ["items", Gift]],
  board: [["board", Grid2X2], ["overlay-layout", Monitor], ["pawn", UserRound]],
} as const;
const labels: Record<WorkspaceTab, string> = { ...configLabels, pawn: "말 디자인" };

export function ConfigurationWorkspace({ section }: { section: ConfigurationSection }) {
  const [selected, setSelected] = useState<Record<ConfigurationSection, WorkspaceTab>>({
    rules: "rules",
    board: "board",
  });
  const tab = selected[section];
  const [visited, setVisited] = useState<WorkspaceTab[]>(["rules", "board"]);
  const [dirty, setDirty] = useState<
    Partial<Record<ChannelConfigKind, boolean>>
  >({});
  const [items, setItems] = useState<NamedItem[]>([]);
  const [itemError, setItemError] = useState("");
  useEffect(() => {
    let live = true;
    void api
      .config("items")
      .then((state) => {
        if (live) {
          const doc = state.effectiveDocument ?? state.published?.document;
          if (Array.isArray(doc)) setItems(doc);
        }
      })
      .catch(() => {
        if (live)
          setItemError(
            "아이템 목록을 불러오지 못했어요. 게임 규칙의 아이템 메뉴에서 확인해주세요.",
          );
      });
    return () => {
      live = false;
    };
  }, []);
  const onDirty = useCallback(
    (kind: ChannelConfigKind, changed: boolean) =>
      setDirty((previous) =>
        previous[kind] === changed
          ? previous
          : { ...previous, [kind]: changed },
      ),
    [],
  );
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">
            {section === "rules" ? "게임 규칙" : "보드 설정"}
          </h1>
          <Badge variant="secondary">게임 설정</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {section === "rules"
            ? "후원 규칙과 게임에 사용할 아이템을 설정하세요."
            : "게임판, 방송 테마·배치, 말 디자인을 설정하세요."}
        </p>
      </header>
      <Tabs
        value={tab}
        onValueChange={(value) => {
          const kind = value as WorkspaceTab;
          setSelected((current) => ({ ...current, [section]: kind }));
          setVisited((current) =>
            current.includes(kind) ? current : [...current, kind],
          );
        }}
      >
        <TabsList wrap>
          {sections[section].map(([kind, Icon]) => (
            <TabsTrigger key={kind} value={kind}>
              <Icon className="size-4" />
              {labels[kind]}
              {kind !== "pawn" && dirty[kind] && <span aria-label="저장하지 않은 변경">•</span>}
            </TabsTrigger>
          ))}
        </TabsList>
        {itemError && (
          <p role="status" className="mt-3 text-sm text-muted-foreground">
            {itemError}
          </p>
        )}
        {visited.map((kind) => (
          <TabsContent
            key={kind}
            value={kind}
            forceMount
            hidden={tab !== kind}
            className="mt-6 data-[state=inactive]:hidden"
          >
            {kind === "pawn" ? (
              <PawnSettings active={section === "board" && tab === "pawn"} />
            ) : (
              <ConfigurationEditor
                kind={kind}
                items={items}
                onDirty={onDirty}
                onItemsPublished={(values) => {
                  setItems(values);
                  setItemError("");
                }}
              />
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
