import type { TColorScheme } from "@gigsnano/core";
import type { ReactNode } from "react";

import { ios, IOS_FONT, iosVars } from "./ios-css";

interface IPhoneFrameProps {
  scheme: TColorScheme;
  caption?: string;
  children: ReactNode;
}

/** iPhone-sized (375×780 pt viewport) device with island + home indicator. */
export function PhoneFrame({ scheme, caption, children }: IPhoneFrameProps) {
  const fg = scheme === "dark" ? "#fff" : "#000";
  return (
    <figure className="flex flex-col items-center gap-3">
      <div
        className="relative rounded-[54px] bg-neutral-950 p-[11px] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.35),0_0_0_1px_rgba(255,255,255,0.06)_inset]"
        style={{ colorScheme: scheme }}
      >
        <div
          className="relative flex h-[780px] w-[375px] flex-col overflow-hidden rounded-[44px]"
          style={{ ...iosVars(scheme), background: ios("background"), fontFamily: IOS_FONT, WebkitFontSmoothing: "antialiased" }}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex h-[50px] items-center justify-between px-8 pt-1">
            <span style={{ color: fg, fontSize: 16, fontWeight: 600, letterSpacing: -0.3 }}>9:41</span>
            <span className="absolute top-[11px] left-1/2 h-[34px] w-[122px] -translate-x-1/2 rounded-full bg-black" />
            <span className="flex items-center gap-1.5" style={{ color: fg }}>
              <svg width="18" height="11" viewBox="0 0 18 11" aria-hidden>
                {[0, 1, 2, 3].map((i) => (
                  <rect key={i} x={i * 5} y={8 - i * 2.6} width="3" height={3 + i * 2.6} rx="0.8" fill="currentColor" />
                ))}
              </svg>
              <svg width="26" height="12" viewBox="0 0 26 12" aria-hidden>
                <rect x="0.5" y="0.5" width="22" height="11" rx="3.2" fill="none" stroke="currentColor" opacity="0.4" />
                <rect x="2" y="2" width="17" height="8" rx="2" fill="currentColor" />
                <rect x="23.6" y="4" width="1.6" height="4" rx="0.8" fill="currentColor" opacity="0.4" />
              </svg>
            </span>
          </div>
          {children}
          <span
            className="pointer-events-none absolute bottom-2 left-1/2 z-30 h-[5px] w-[134px] -translate-x-1/2 rounded-full"
            style={{ background: fg }}
          />
        </div>
      </div>
      {caption ? <figcaption className="text-sm text-muted-foreground">{caption}</figcaption> : null}
    </figure>
  );
}
