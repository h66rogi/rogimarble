import { apiClient } from "@/shared/lib/api-client";
import type { GetLiveStatusesResponse } from "@/domains/channel/types/live-status";

/**
 * GET /channels/live-statuses?channelIds=1,2,3
 */
export async function getLiveStatuses(
  ids: number[]
): Promise<GetLiveStatusesResponse> {
  const response = await apiClient.get<GetLiveStatusesResponse>(
    "/channels/live-statuses",
    {
      params: { channelIds: ids.join(",") },
    }
  );
  return response.data;
}
