"use client";

import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";

/**
 * Liam-style relationship edge: a 1px solid bezier line that, when its endpoints
 * are highlighted, gets a "data-flow" animation — a few gradient particles
 * (comets) traveling along the path via SVG <animateMotion>, rather than the
 * dashed marching-ants of React Flow's default `animated` edge. The flow gradient
 * `#erd-flow-gradient` is defined once by the canvas.
 */

const PARTICLE_COUNT = 5;
const DURATION = 5;

export function ErdRelationshipEdge({
  id,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  data,
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const active = Boolean((data as { active?: boolean } | undefined)?.active);

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          // Emerald when active (matches the PK/FK key/link glyphs), muted otherwise.
          stroke: active ? "#10b981" : "var(--border)",
          strokeWidth: active ? 1.5 : 1,
          opacity: active ? 1 : 0.45,
          transition: "stroke 0.3s ease, opacity 0.3s ease",
        }}
      />
      {active
        ? Array.from({ length: PARTICLE_COUNT }).map((_, i) => (
            <ellipse key={`${id}-p${i}`} rx="5" ry="1.4" fill="url(#erd-flow-gradient)">
              <animateMotion
                dur={`${DURATION}s`}
                begin={`${-i * (DURATION / PARTICLE_COUNT)}s`}
                repeatCount="indefinite"
                rotate="auto"
                path={edgePath}
              />
            </ellipse>
          ))
        : null}
    </>
  );
}
