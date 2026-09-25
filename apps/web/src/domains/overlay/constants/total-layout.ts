import { DEFAULT_MARBLE_OVERLAY_LAYOUT, type OverlayWidgetId } from "@rogimarble/contracts";

export type TotalOverlayWidgetId =
  | "queue"
  | "now-playing"
  | "chatbox"
  | "alertbox"
  | "setlist"
  | "lyrics"
  | "songbook-qr"
  | "board"
  | "dice"
  | "current_mission"
  | "inventory"
  | "direction"
  | "menu"
  | "dice_price";

export type TotalOverlayLayoutWidget = {
  id: TotalOverlayWidgetId;
  enabled: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
};

export type TotalOverlayLayout = {
  version: number;
  aspect: string;
  widgets: TotalOverlayLayoutWidget[];
};

export const DEFAULT_TOTAL_OVERLAY_LAYOUT: TotalOverlayLayout = {
  version: 1,
  aspect: "16:9",
  widgets: [
    {
      id: "queue",
      enabled: true,
      x: 0.7969,
      y: 0.037,
      w: 0.1823,
      h: 0.6481,
      z: 2,
    },
    {
      id: "now-playing",
      enabled: true,
      x: 0.0208,
      y: 0.8148,
      w: 0.4167,
      h: 0.1481,
      z: 1,
    },
    {
      id: "chatbox",
      enabled: false,
      x: 0.0208,
      y: 0.037,
      w: 0.3,
      h: 0.3,
      z: 0,
    },
    {
      id: "alertbox",
      enabled: false,
      x: 0.35,
      y: 0.037,
      w: 0.3,
      h: 0.2,
      z: 0,
    },
    {
      id: "setlist",
      enabled: false,
      x: 0.02,
      y: 0.04,
      w: 0.28,
      h: 0.55,
      z: 0,
    },
    {
      id: "lyrics",
      enabled: false,
      x: 0.25,
      y: 0.7,
      w: 0.5,
      h: 0.25,
      z: 0,
    },
    {
      id: "songbook-qr",
      enabled: false,
      x: 0.742,
      y: 0.664,
      w: 0.18,
      h: 0.28,
      z: 3,
    },
  ],
};

export const DEFAULT_SYNC_TOTAL_OVERLAY_LAYOUT: TotalOverlayLayout = {
  version: 1,
  aspect: "16:9",
  widgets: [
    {
      id: "queue",
      enabled: true,
      x: 0.7969,
      y: 0.037,
      w: 0.1823,
      h: 0.6481,
      z: 2,
    },
    {
      id: "now-playing",
      enabled: true,
      x: 0.0208,
      y: 0.8148,
      w: 0.2083,
      h: 0.1481,
      z: 1,
    },
    {
      id: "chatbox",
      enabled: false,
      x: 0.0208,
      y: 0.037,
      w: 0.3,
      h: 0.3,
      z: 0,
    },
    {
      id: "alertbox",
      enabled: false,
      x: 0.35,
      y: 0.037,
      w: 0.3,
      h: 0.2,
      z: 0,
    },
    {
      id: "setlist",
      enabled: false,
      x: 0.02,
      y: 0.04,
      w: 0.28,
      h: 0.55,
      z: 0,
    },
    {
      id: "lyrics",
      enabled: false,
      x: 0.25,
      y: 0.7,
      w: 0.5,
      h: 0.25,
      z: 0,
    },
    {
      id: "songbook-qr",
      enabled: false,
      x: 0.742,
      y: 0.664,
      w: 0.18,
      h: 0.28,
      z: 3,
    },
  ],
};

const marbleFallbackWidgets = [
  { id: "board", enabled: false, x: 0, y: 0, w: 1, h: 1, z: 0 },
  { id: "direction", enabled: false, x: 0.3, y: 0.28, w: 0.14, h: 0.07, z: 3 },
  { id: "inventory", enabled: false, x: 0.56, y: 0.28, w: 0.14, h: 0.07, z: 3 },
  { id: "current_mission", enabled: false, x: 0.32, y: 0.68, w: 0.36, h: 0.075, z: 3 },
  { id: "dice", enabled: false, x: 0.43, y: 0.44, w: 0.14, h: 0.12, z: 4 },
  { id: "menu", enabled: false, x: 0.13, y: 0.32, w: 0.22, h: 0.35, z: 5 },
  { id: "dice_price", enabled: false, x: 0.13, y: 0.24, w: 0.22, h: 0.065, z: 5 },
  { id: "chatbox", enabled: false, x: 0.78, y: 0.38, w: 0.2, h: 0.5, z: 4 },
] as const satisfies readonly (TotalOverlayLayoutWidget & { id: OverlayWidgetId })[];

export const DEFAULT_MARBLE_TOTAL_OVERLAY_LAYOUT = {
  version: DEFAULT_MARBLE_OVERLAY_LAYOUT.schemaVersion,
  aspect: DEFAULT_MARBLE_OVERLAY_LAYOUT.aspectRatio,
  widgets: marbleFallbackWidgets.map((fallback) => {
    const saved = DEFAULT_MARBLE_OVERLAY_LAYOUT.widgets.find((widget) => widget.id === fallback.id);
    return saved
      ? {
          ...fallback,
          enabled: true,
          x: saved.bounds.x,
          y: saved.bounds.y,
          w: saved.bounds.width,
          h: saved.bounds.height,
          z: saved.z,
        }
      : fallback;
  }),
} satisfies TotalOverlayLayout;
