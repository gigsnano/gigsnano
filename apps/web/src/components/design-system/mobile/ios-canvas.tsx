import type { TColorScheme } from "@gigsnano/core";
import type { ReactNode } from "react";

import { ios, IOS_FONT, iosVars } from "./ios-css";

/** A grouped-background surface with the iOS tokens in scope — for specimens outside a phone. */
export function IosCanvas({ scheme, children, className = "" }: { scheme: TColorScheme; children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl p-5 ${className}`}
      style={{ ...iosVars(scheme), background: ios("background"), color: ios("label"), fontFamily: IOS_FONT, colorScheme: scheme }}
    >
      {children}
    </div>
  );
}
