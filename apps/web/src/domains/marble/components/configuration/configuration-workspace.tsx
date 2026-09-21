"use client";

import { useCallback, useEffect, useState } from "react";
import { Gift, Grid2X2, HeartHandshake, Monitor } from "lucide-react";
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

const sections = [
  ["board", Grid2X2],
  ["rules", HeartHandshake],
  ["items", Gift],
  ["overlay-layout", Monitor],
] as const;
export function ConfigurationWorkspace() {
  const [tab, setTab] = useState<ChannelConfigKind>("board");
  const [visited, setVisited] = useState<ChannelConfigKind[]>(["board"]);
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
            "아이템 목록을 불러오지 못했어요. 아이템 탭에서 설정을 확인해주세요.",
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
          <h1 className="text-2xl font-bold tracking-tight">규칙·보드</h1>
          <Badge variant="secondary">게임 설정</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          방송에 맞는 게임판과 후원 규칙을 만들어보세요.
        </p>
      </header>
      <Tabs
        value={tab}
        onValueChange={(value) => {
          const kind = value as ChannelConfigKind;
          setTab(kind);
          setVisited((current) =>
            current.includes(kind) ? current : [...current, kind],
          );
        }}
      >
        <TabsList wrap>
          {sections.map(([kind, Icon]) => (
            <TabsTrigger key={kind} value={kind}>
              <Icon className="size-4" />
              {configLabels[kind]}
              {dirty[kind] && <span aria-label="저장하지 않은 변경">•</span>}
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
            <ConfigurationEditor
              kind={kind}
              items={items}
              onDirty={onDirty}
              onItemsPublished={(values) => {
                setItems(values);
                setItemError("");
              }}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
