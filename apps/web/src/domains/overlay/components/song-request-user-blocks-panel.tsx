"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Ban,
  Loader2,
  RotateCcw,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/shared/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { InlineError } from "@/shared/components/common/error-boundary";
import { cn } from "@/shared/lib/utils";
import { extractApiErrorMessage } from "@/shared/lib/api-error";
import type {
  ChannelUserBlockFeature,
  CreateChannelUserBlockDto,
  SongRequestUserBlock,
} from "@/domains/overlay/apis/song-requests";
import {
  useCreateChannelUserBlock,
  useDeleteSongRequestUserBlock,
  useSongRequestUserBlocks,
} from "@/domains/overlay/hooks/use-song-requests";

type BlockGroup = {
  id: string;
  blocks: SongRequestUserBlock[];
  requesterNickname: string;
  scope: SongRequestUserBlock["scope"];
  primaryLabel: string;
  targetLabels: string[];
  featureLabels: string[];
  reason: string | null;
  createdAt: string;
};

const TARGET_LABELS: Record<SongRequestUserBlock["targetType"], string> = {
  USER: "멜로밍 계정",
  PLATFORM: "방송 플랫폼",
  DI: "본인인증",
  ANONYMOUS: "익명 신청",
};

const PLATFORM_LABELS: Record<string, string> = {
  SOOP: "SOOP",
  CHZZK: "치지직",
  CIME: "씨미",
  OTHER: "기타",
};

const FEATURE_OPTIONS: Array<{ value: ChannelUserBlockFeature; label: string }> = [
  { value: "SONG_REQUEST", label: "노래책 신청곡" },
  { value: "BOARD", label: "게시판" },
  { value: "HOMEWORK_SONG", label: "숙제곡" },
  { value: "VOICE_COMMISSION", label: "보이스커미션" },
  { value: "GIFT", label: "선물하기" },
  { value: "TALK", label: "멜로밍 톡" },
  { value: "ALL", label: "전체 기능" },
];

const FEATURE_LABELS = Object.fromEntries(
  FEATURE_OPTIONS.map((item) => [item.value, item.label])
) as Record<ChannelUserBlockFeature, string>;

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getPrimaryLabel(block: SongRequestUserBlock): string {
  if (block.requestUserId) {
    return `멜로밍 유저 #${block.requestUserId}`;
  }
  if (block.platform && block.platformUserId) {
    const platform = PLATFORM_LABELS[block.platform] ?? block.platform;
    return `${platform} ${block.platformUserId}`;
  }
  if (block.targetType === "ANONYMOUS") {
    return "익명 신청자";
  }
  return block.targetKey;
}

function getGroupKey(block: SongRequestUserBlock): string {
  const scopeKey =
    block.scope === "GLOBAL" ? "global" : `channel:${block.channelId ?? "none"}`;
  if (block.requestUserId) return `${scopeKey}:user:${block.requestUserId}`;
  if (block.platform && block.platformUserId) {
    return `${scopeKey}:platform:${block.platform}:${block.platformUserId}`;
  }
  return `${scopeKey}:${block.targetType}:${block.targetKey}`;
}

function groupBlocks(blocks: SongRequestUserBlock[]): BlockGroup[] {
  const grouped = new Map<string, BlockGroup>();
  for (const block of blocks) {
    const key = getGroupKey(block);
    const existing = grouped.get(key);
    const label = TARGET_LABELS[block.targetType];
    if (existing) {
      existing.blocks.push(block);
      if (!existing.targetLabels.includes(label)) {
        existing.targetLabels.push(label);
      }
      const featureLabel = FEATURE_LABELS[block.feature] ?? block.feature;
      if (!existing.featureLabels.includes(featureLabel)) {
        existing.featureLabels.push(featureLabel);
      }
      if (new Date(block.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
        existing.createdAt = block.createdAt;
      }
      continue;
    }
    grouped.set(key, {
      id: key,
      blocks: [block],
      requesterNickname: block.requesterNickname,
      scope: block.scope,
      primaryLabel: getPrimaryLabel(block),
      targetLabels: [label],
      featureLabels: [FEATURE_LABELS[block.feature] ?? block.feature],
      reason: block.reason ?? null,
      createdAt: block.createdAt,
    });
  }
  return Array.from(grouped.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function SongRequestUserBlocksPanel({
  channelId,
  includeGlobal = true,
  compact = false,
  className,
}: {
  channelId: number | null | undefined;
  includeGlobal?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const [search, setSearch] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<BlockGroup | null>(null);
  const [targetBasis, setTargetBasis] =
    useState<CreateChannelUserBlockDto["targetBasis"]>("MELOMING_USER");
  const [melomingUserId, setMelomingUserId] = useState("");
  const [platform, setPlatform] = useState("CHZZK");
  const [platformUserId, setPlatformUserId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [reason, setReason] = useState("");
  const [features, setFeatures] = useState<ChannelUserBlockFeature[]>([
    "SONG_REQUEST",
  ]);
  const {
    data: blocks = [],
    isLoading,
    error,
    refetch,
  } = useSongRequestUserBlocks(
    channelId ? { channelId, includeGlobal } : null,
    { enabled: !!channelId },
  );
  const deleteMutation = useDeleteSongRequestUserBlock(channelId ?? null);
  const createMutation = useCreateChannelUserBlock(channelId ?? null);

  const groups = useMemo(() => groupBlocks(blocks), [blocks]);
  const filteredGroups = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return groups;
    return groups.filter((group) => {
      const haystack = [
        group.requesterNickname,
        group.primaryLabel,
        group.reason ?? "",
        ...group.targetLabels,
        ...group.featureLabels,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [groups, search]);

  const handleConfirmUnblock = async () => {
    if (!selectedGroup) return;
    try {
      for (const block of selectedGroup.blocks) {
        await deleteMutation.mutateAsync(block.id);
      }
      toast.success(`${selectedGroup.requesterNickname} 차단을 해제했습니다`);
      setSelectedGroup(null);
      await refetch();
    } catch (err) {
      toast.error(extractApiErrorMessage(err, "차단 해제에 실패했습니다"));
    }
  };

  const toggleFeature = (feature: ChannelUserBlockFeature) => {
    setFeatures((current) => {
      if (feature === "ALL") return current.includes("ALL") ? [] : ["ALL"];
      const withoutAll = current.filter((item) => item !== "ALL");
      if (withoutAll.includes(feature)) {
        return withoutAll.filter((item) => item !== feature);
      }
      return [...withoutAll, feature];
    });
  };

  const handleCreateBlock = async () => {
    if (!channelId) return;
    try {
      await createMutation.mutateAsync({
        channelId,
        scope: "CHANNEL",
        features: features.length > 0 ? features : ["SONG_REQUEST"],
        targetBasis,
        melomingUserId:
          targetBasis === "MELOMING_USER" ? Number(melomingUserId) : undefined,
        platform: targetBasis === "PLATFORM_USER" ? platform : undefined,
        platformUserId:
          targetBasis === "PLATFORM_USER" ? platformUserId.trim() : undefined,
        displayName: displayName.trim() || undefined,
        reason: reason.trim() || undefined,
      });
      setMelomingUserId("");
      setPlatformUserId("");
      setDisplayName("");
      setReason("");
      toast.success("차단 규칙을 추가했습니다");
      await refetch();
    } catch (err) {
      toast.error(extractApiErrorMessage(err, "차단 규칙 추가에 실패했습니다"));
    }
  };

  const canCreate =
    !createMutation.isPending &&
    features.length > 0 &&
    (targetBasis === "MELOMING_USER"
      ? Number(melomingUserId) > 0
      : platformUserId.trim().length > 0);

  if (!channelId) {
    return (
      <div className="flex items-center justify-center rounded-md border border-dashed py-10 text-sm text-muted-foreground">
        채널 정보를 불러오는 중입니다.
      </div>
    );
  }

  if (error) {
    return (
      <InlineError
        message="차단 목록을 불러오지 못했습니다."
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {!compact && (
        <Alert>
          <AlertTriangle className="size-4" />
          <AlertTitle>신청곡 차단 범위</AlertTitle>
          <AlertDescription>
            멜로밍 웹/앱 신청은 멜로밍 계정과 본인인증 기준을 함께 적용하고,
            채팅/후원 신청은 방송 플랫폼 계정 기준으로 적용합니다. 익명 신청을
            허용하면 동일 사용자가 다른 익명 정보로 다시 신청할 수 있습니다.
          </AlertDescription>
        </Alert>
      )}

      {!compact && (
        <section className="rounded-md border bg-card p-4">
          <div className="grid gap-4 lg:grid-cols-[220px_1fr_180px] lg:items-end">
            <div className="space-y-2">
              <Label>차단 기준</Label>
              <Select
                value={targetBasis}
                onValueChange={(value) =>
                  setTargetBasis(value as CreateChannelUserBlockDto["targetBasis"])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MELOMING_USER">멜로밍 유저 ID</SelectItem>
                  <SelectItem value="PLATFORM_USER">외부 플랫폼 유저 ID</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {targetBasis === "MELOMING_USER" ? (
              <div className="space-y-2">
                <Label>멜로밍 유저 ID</Label>
                <Input
                  inputMode="numeric"
                  value={melomingUserId}
                  onChange={(event) => setMelomingUserId(event.target.value)}
                  placeholder="1234"
                />
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
                <div className="space-y-2">
                  <Label>플랫폼</Label>
                  <Select value={platform} onValueChange={setPlatform}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CHZZK">치지직</SelectItem>
                      <SelectItem value="SOOP">SOOP</SelectItem>
                      <SelectItem value="CIME">씨미</SelectItem>
                      <SelectItem value="OTHER">기타</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>플랫폼 유저 ID</Label>
                  <Input
                    value={platformUserId}
                    onChange={(event) => setPlatformUserId(event.target.value)}
                    placeholder="external-user-id"
                  />
                </div>
              </div>
            )}

            <Button
              type="button"
              className="gap-2"
              disabled={!canCreate}
              onClick={() => void handleCreateBlock()}
            >
              {createMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Ban className="size-4" />
              )}
              차단 추가
            </Button>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr]">
            <div className="space-y-2">
              <Label>적용 기능</Label>
              <div className="flex flex-wrap gap-2">
                {FEATURE_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className="flex h-8 items-center gap-2 rounded-md border px-2.5 text-xs"
                  >
                    <Checkbox
                      checked={features.includes(option.value)}
                      onCheckedChange={() => toggleFeature(option.value)}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>표시 이름</Label>
                <Input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  maxLength={255}
                  placeholder="선택 입력"
                />
              </div>
              <div className="space-y-2">
                <Label>사유</Label>
                <Input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={255}
                  placeholder="선택 입력"
                />
              </div>
            </div>
          </div>
        </section>
      )}

      <div
        className={cn(
          "flex gap-2",
          compact ? "items-center" : "items-center justify-between",
        )}
      >
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="닉네임, 계정, 사유 검색"
            className="pl-8"
          />
        </div>
        <Badge variant="secondary" className="h-9 shrink-0 px-3">
          {groups.length}명
        </Badge>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center rounded-md border py-10">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-12 text-center">
          <div className="mb-3 flex size-11 items-center justify-center rounded-md bg-muted">
            <Ban className="size-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">
            {groups.length === 0 ? "차단된 신청자가 없습니다" : "검색 결과가 없습니다"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            신청곡 대기열 또는 콘솔에서 신청자를 차단하면 여기에 표시됩니다.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <div
            className={cn(
              "hidden bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground md:grid",
              compact
                ? "grid-cols-[minmax(0,1fr)_88px]"
                : "grid-cols-[minmax(0,1.4fr)_96px_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1fr)_120px_88px]",
            )}
          >
            <div>대상</div>
            {!compact && <div>범위</div>}
            {!compact && <div>적용 기준</div>}
            {!compact && <div>기능</div>}
            {!compact && <div>사유</div>}
            {!compact && <div>차단일</div>}
            <div className="text-right">관리</div>
          </div>
          <div className="divide-y">
            {filteredGroups.map((group) => (
              <div
                key={group.id}
                className={cn(
                  "grid gap-3 px-3 py-3",
                  compact
                    ? "grid-cols-[minmax(0,1fr)_88px]"
                    : "grid-cols-1 md:grid-cols-[minmax(0,1.4fr)_96px_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1fr)_120px_88px] md:items-center",
                )}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                      <UserRound className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {group.requesterNickname}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {group.primaryLabel}
                      </p>
                    </div>
                  </div>
                  {compact && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {group.targetLabels.map((label) => (
                        <Badge key={label} variant="outline" className="text-[10px]">
                          {label}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                {!compact && (
                  <div>
                    <Badge
                      variant={group.scope === "GLOBAL" ? "destructive" : "secondary"}
                    >
                      {group.scope === "GLOBAL" ? "글로벌" : "채널"}
                    </Badge>
                  </div>
                )}
                {!compact && (
                  <div className="flex flex-wrap gap-1">
                    {group.targetLabels.map((label) => (
                      <Badge key={label} variant="outline">
                        {label}
                      </Badge>
                    ))}
                    {group.blocks.length > 1 && (
                      <Badge variant="outline" className="gap-1">
                        <ShieldCheck className="size-3" />
                        {group.blocks.length}개 규칙
                      </Badge>
                    )}
                  </div>
                )}
                {!compact && (
                  <div className="flex flex-wrap gap-1">
                    {group.featureLabels.map((label) => (
                      <Badge key={label} variant="secondary">
                        {label}
                      </Badge>
                    ))}
                  </div>
                )}
                {!compact && (
                  <p className="truncate text-sm text-muted-foreground">
                    {group.reason || "-"}
                  </p>
                )}
                {!compact && (
                  <p className="text-sm text-muted-foreground">
                    {formatDate(group.createdAt)}
                  </p>
                )}
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedGroup(group)}
                    disabled={deleteMutation.isPending}
                  >
                    <RotateCcw className="mr-1.5 size-3.5" />
                    해제
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <AlertDialog
        open={selectedGroup !== null}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) setSelectedGroup(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>차단을 해제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedGroup?.requesterNickname} 신청자의 신청곡 차단 규칙{" "}
              {selectedGroup?.blocks.length ?? 0}개를 해제합니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              취소
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmUnblock();
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <RotateCcw className="mr-2 size-4" />
              )}
              해제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
