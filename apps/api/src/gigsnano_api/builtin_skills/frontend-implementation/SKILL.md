---
name: frontend-implementation
version: 1.0.0
description: Implement UI as composable, state-complete components that match the project's framework conventions.
---

# Frontend Implementation

**Use when:** building or changing user-facing components/pages.
**Not for:** backend, data, or infra work.

## Steps
1. Follow the project's framework conventions and file layout — read a nearby
   feature first (see repo-context-loader) and mirror it.
2. Compose small, single-responsibility components; lift shared logic into hooks
   / helpers rather than duplicating it.
3. Render every state: loading, empty, error, and populated — from real data
   sources, not placeholders.
4. Keep data access at the right layer (a hook/service, not inline fetches in
   components) if that's the project's pattern.
5. Use the design system's tokens and primitives (see design-system-compliance);
   no hardcoded styles.

## Negative signal
A component that fetches data inline, hardcodes styles, or only handles the happy
path is incomplete — cover the states and respect the layers.
