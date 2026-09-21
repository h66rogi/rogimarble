import { useQuery } from "@tanstack/react-query";
import { getLiveStatuses } from "@/domains/channel/apis/live-status";
import type {
  GetLiveStatusesResponse,
  LiveStatusItem,
} from "@/domains/channel/types/live-status";
import { useFeatureFlag } from "@/shared/hooks/use-feature-flag";

export const liveStatusKeys = {
  all: ["live-statuses"] as const,
  byIds: (ids: number[]) =>
    [...liveStatusKeys.all, ids.slice().sort((a, b) => a - b).join(",")] as const,
};

/**
 * Fetch live statuses for a batch of channel IDs.
 * Polls every 60 s (default) and treats data as stale after 30 s.
 *
 * By default this hook is gated behind the `channelLiveStatus` PostHog flag so
 * legacy surfaces can opt in gradually. Pass `options.enabled = true` to
 * override and force polling regardless of the flag — useful for features
 * with their own kill-switch (e.g. song-detail streamer list) that must not
 * be coupled to an unrelated flag.
 */
export function useChannelLiveStatuses(
  channelIds: number[],
  options?: { enabled?: boolean; refetchInterval?: number },
) {
  const flagEnabled = useFeatureFlag("channelLiveStatus");
  // Explicit `enabled` from the caller wins; otherwise fall back to the flag.
  const enabled =
    (options?.enabled ?? flagEnabled) && channelIds.length > 0;
  return useQuery({
    queryKey: liveStatusKeys.byIds(channelIds),
    queryFn: () => getLiveStatuses(channelIds),
    enabled,
    staleTime: 30_000,
    refetchInterval: (query) => {
      const interval = options?.refetchInterval ?? 60_000;
      if (query.state.fetchStatus === "idle" && query.state.error) {
        return interval * 4; // backoff: 60s→240s on error, auto-recovers on success
      }
      return interval;
    },
  });
}

/**
 * Extract live statuses for a single channel from the batch response.
 */
export function getLiveStatusesForChannel(
  data: GetLiveStatusesResponse | undefined,
  channelId: number
): LiveStatusItem[] {
  if (!data) return [];
  const entry = data.channels.find((c) => c.channelId === channelId);
  return entry?.liveStatuses ?? [];
}
