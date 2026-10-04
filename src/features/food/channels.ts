export const CHANNELS = ["kiosk", "webapp", "website"] as const;
export type Channel = (typeof CHANNELS)[number];
