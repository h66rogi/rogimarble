export interface LiveStatusItem {
  platform: string;
  platformChannelId: string;
  streamerName: string;
  viewerCount: number;
  title: string;
  category: string;
  thumbnailUrl: string;
  broadcastStartedAt: string;
  broadcastUrl: string;
  tags?: string[];
}

export interface ChannelLiveStatus {
  channelId: number;
  liveStatuses: LiveStatusItem[];
}

export interface GetLiveStatusesResponse {
  channels: ChannelLiveStatus[];
}
