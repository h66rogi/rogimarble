import { useQuery } from "@tanstack/react-query";
import { getMyChannel } from "@/domains/channel/apis/channels";
import type { GetChannelMyResponse } from "@/domains/channel/types/channel";

export const myChannelKeys = {
  all: ["my-channel"] as const,
};

interface UseMyChannelOptions {
  userId?: number;
  enabled?: boolean;
  staleTime?: number;
  gcTime?: number;
  initialData?: GetChannelMyResponse;
}

/**
 * 현재 사용자의 채널 정보를 가져오는 훅
 * @param options - useQuery 옵션
 * @returns 현재 사용자의 채널 정보
 */
export function useMyChannel(options?: UseMyChannelOptions) {
  return useQuery({
    queryKey:
      options?.userId === undefined
        ? myChannelKeys.all
        : [...myChannelKeys.all, options.userId],
    queryFn: getMyChannel,
    enabled: options?.enabled ?? true,
    staleTime: options?.staleTime ?? 5 * 60 * 1000,
    gcTime: options?.gcTime ?? 10 * 60 * 1000,
    initialData: options?.initialData,
  });
}
