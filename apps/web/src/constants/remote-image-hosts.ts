/** Hostnames allowed for `next/image` remote loading — keep in sync with `next.config.ts`. */
export const REMOTE_IMAGE_HOSTNAMES = ["images.unsplash.com"] as const;

export type RemoteImageHostname = (typeof REMOTE_IMAGE_HOSTNAMES)[number];
