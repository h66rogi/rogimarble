import { apiClient } from "@/shared/lib/api-client";
import type { TotalOverlayLayout } from "@/domains/overlay/constants/total-layout";

export interface SyncOverlayLayoutResponse {
  layoutType: string;
  layout: TotalOverlayLayout;
  layoutVersion: number;
  layoutUpdatedAt: string | null;
}

export async function getSyncRoomOverlayLayout(
  code: string,
  layoutType = "sync-total"
): Promise<SyncOverlayLayoutResponse> {
  const response = await apiClient.get<SyncOverlayLayoutResponse>(
    `/sync-rooms/${encodeURIComponent(code)}/overlay-layouts/${layoutType}`,
    { withCredentials: true }
  );
  return response.data;
}

export async function updateSyncRoomOverlayLayout(
  code: string,
  layoutType: string,
  layout: TotalOverlayLayout
): Promise<SyncOverlayLayoutResponse> {
  const response = await apiClient.put<SyncOverlayLayoutResponse>(
    `/sync-rooms/${encodeURIComponent(code)}/overlay-layouts/${layoutType}`,
    { layout },
    { withCredentials: true }
  );
  return response.data;
}
