"use client";

import { useEffect, type RefObject } from "react";

/** Close the extended sidebar when clicking outside (Plane parity). */
export function useExtendedSidebarOutsideClick(
  ref: RefObject<HTMLElement | null>,
  isOpen: boolean,
  onClose: () => void,
  excludedElementId?: string,
) {
  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (ref.current?.contains(target)) return;
      if (
        excludedElementId &&
        target instanceof Element &&
        target.closest(`#${excludedElementId}`)
      ) {
        return;
      }
      onClose();
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [excludedElementId, isOpen, onClose, ref]);
}
