import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import type { TotalOverlayLayout } from "@/domains/overlay/constants/total-layout";
import {
  getSyncRoomOverlayLayout,
  updateSyncRoomOverlayLayout,
  type SyncOverlayLayoutResponse,
} from "@/domains/sync/apis/sync-overlay-layouts";

const syncOverlayLayoutKeys = {
  all: (code: string) => ["sync-room-overlay-layouts", code] as const,
  detail: (code: string, layoutType: string) =>
    [...syncOverlayLayoutKeys.all(code), layoutType] as const,
};

function shouldRetryAuthError(failureCount: number, error: unknown): boolean {
  const status = (error as AxiosError | undefined)?.response?.status;
  if (status === 401 || status === 403) {
    return false;
  }
  return failureCount < 2;
}

export function useSyncRoomOverlayLayout(
  code: string,
  layoutType = "sync-total",
  enabled = true
) {
  return useQuery({
    queryKey: syncOverlayLayoutKeys.detail(code, layoutType),
    queryFn: () => getSyncRoomOverlayLayout(code, layoutType),
    enabled: Boolean(code) && enabled,
    staleTime: 1000 * 60 * 5,
    retry: shouldRetryAuthError,
  });
}

export function useUpdateSyncRoomOverlayLayout(
  code: string,
  layoutType = "sync-total"
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (layout: TotalOverlayLayout) =>
      updateSyncRoomOverlayLayout(code, layoutType, layout),
    onSuccess: (data: SyncOverlayLayoutResponse) => {
      queryClient.setQueryData(
        syncOverlayLayoutKeys.detail(code, layoutType),
        data
      );
    },
  });
}
