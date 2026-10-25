"use client";

import { useEffect, useRef, useState } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  attachInstruction,
  extractInstruction,
  type Instruction,
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/list-item";

const DRAG_KIND = "issue-row";

/**
 * Wires one List row as both a pdnd draggable and a list-item drop target.
 * The hitbox offers reorder-before/reorder-after at the row edges and `combine`
 * in the middle — dropping onto a row (combine) is surfaced so the caller can
 * offer to link the dragged item as a child (GIN-80). Gated on `enabled` — no
 * wiring (and no drag affordance) when manual sort isn't active.
 */
export function useListDrag({
  storyId,
  enabled,
  onDrop,
}: {
  storyId: string;
  enabled: boolean;
  onDrop: (args: { sourceId: string; targetId: string; instruction: Instruction }) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<HTMLButtonElement | null>(null);
  const [instruction, setInstruction] = useState<Instruction | null>(null);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element) return;

    return combine(
      draggable({
        element,
        dragHandle: handleRef.current ?? undefined,
        getInitialData: () => ({ storyId, kind: DRAG_KIND }),
      }),
      dropTargetForElements({
        element,
        canDrop: ({ source }) => source.data.kind === DRAG_KIND && source.data.storyId !== storyId,
        getData: ({ input, element }) =>
          attachInstruction(
            { storyId, kind: DRAG_KIND },
            {
              input,
              element,
              operations: {
                "reorder-before": "available",
                "reorder-after": "available",
                combine: "available",
              },
            },
          ),
        onDrag: ({ self }) => setInstruction(extractInstruction(self.data)),
        onDragLeave: () => setInstruction(null),
        onDrop: ({ self, source }) => {
          setInstruction(null);
          const sourceId = source.data.storyId;
          const dropInstruction = extractInstruction(self.data);
          if (typeof sourceId !== "string" || sourceId === storyId) return;
          if (!dropInstruction) return;
          onDropRef.current({ sourceId, targetId: storyId, instruction: dropInstruction });
        },
      }),
    );
  }, [enabled, storyId]);

  return { ref, handleRef, instruction };
}
