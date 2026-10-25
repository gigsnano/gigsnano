"use client";

import { createContext, use } from "react";
import type { ReferenceAreaConfig } from "@/components/charts/context/reference-area-config";

export interface ReferenceAreaRegistrationContextValue {
  registerReferenceArea: (id: string, config: ReferenceAreaConfig) => void;
  unregisterReferenceArea: (id: string) => void;
}

export const ReferenceAreaRegistrationContext =
  createContext<ReferenceAreaRegistrationContextValue | null>(null);

function useReferenceAreaRegistration(): ReferenceAreaRegistrationContextValue | null {
  return use(ReferenceAreaRegistrationContext);
}
