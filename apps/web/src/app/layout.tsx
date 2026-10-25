import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { cn } from "@/lib/utils";
import { figtree, geistMono, inter } from "@/lib/fonts";
import { PANEL_INIT_SCRIPT } from "@/constants/panel-init";
import { Providers } from "./providers";

// Unset in local dev, so only builds with the ID (prod) send hits.
const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export const metadata: Metadata = {
  title: "GigsNano",
  description: "AI-agent-driven, BMAD-powered project & product management.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "h-full",
        "antialiased",
        geistMono.variable,
        "font-sans",
        inter.variable,
        figtree.variable,
      )}
    >
      <body className="min-h-full flex flex-col">
        <Script
          id="gn-panel-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: PANEL_INIT_SCRIPT }}
        />
        <Providers>{children}</Providers>
        {GA_MEASUREMENT_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
              strategy="afterInteractive"
            />
            <Script id="gn-ga-init" strategy="afterInteractive">
              {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_MEASUREMENT_ID}');`}
            </Script>
          </>
        )}
      </body>
    </html>
  );
}
