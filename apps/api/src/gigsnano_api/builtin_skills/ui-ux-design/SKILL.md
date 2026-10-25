---
name: ui-ux-design
version: 1.0.0
description: Shape a UI change intentionally — hierarchy, states, and flow — before writing components.
---

# UI/UX Design

**Use when:** a work item creates or reshapes a user-facing interface.
**Not for:** backend-only, data, or infra work with no rendered surface.

## Steps
1. Name the primary job of the screen and the one action the user should take;
   let visual hierarchy follow it.
2. Design every state, not just the happy path: empty, loading, error, and the
   populated case.
3. Keep the interaction obvious — reuse existing patterns and components over
   inventing new ones.
4. Check flow: how the user arrives, what they do, where they go next. Remove
   steps that don't earn their place.

## Negative signal
If the design adds controls or options nothing in the task needs, cut them.
