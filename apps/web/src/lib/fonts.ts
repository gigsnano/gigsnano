import localFont from "next/font/local";
import { GeistMono } from "geist/font/mono";

/** Body / UI sans — self-hosted so Docker builds don't hit fonts.gstatic.com. */
export const inter = localFont({
  src: "../fonts/inter-latin-wght-normal.woff2",
  variable: "--font-sans",
  display: "swap",
  weight: "100 900",
});

/** Heading face for the app shell. */
export const figtree = localFont({
  src: "../fonts/figtree-latin-wght-normal.woff2",
  variable: "--font-heading",
  display: "swap",
  weight: "100 900",
});

/** Marketing display face (Space Grotesk). */
export const spaceGrotesk = localFont({
  src: "../fonts/space-grotesk-latin-wght-normal.woff2",
  variable: "--font-display",
  display: "swap",
  weight: "500 700",
});

/** Monospace — bundled via the `geist` package (local files, no Google fetch). */
export const geistMono = GeistMono;
