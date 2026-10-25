import type { IContract } from "@/types";

/** Freelancer work surface — lives on the marketplace contract route (no workspace shell). */
export function contractWorkHref(contract: Pick<IContract, "id">): string {
  return `/marketplace/contracts/${contract.id}`;
}
