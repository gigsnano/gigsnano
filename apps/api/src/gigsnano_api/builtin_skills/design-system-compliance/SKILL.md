---
name: design-system-compliance
version: 1.0.0
description: Build UI from the project's existing design tokens and components, never hardcoded values.
---

# Design-System Compliance

**Use when:** implementing or reviewing UI in a project that has a design system
or token set.
**Not for:** projects with no established design system (flag that gap instead).

## Steps
1. Use the design tokens for color, spacing, radius, and typography — never
   hardcoded hex, px, or one-off values.
2. Compose from existing primitives/components before creating a new one; extend
   the system rather than working around it.
3. Respect light/dark and theme variants — read from the token layer so both
   work without special-casing.
4. If the design genuinely needs something the system lacks, add it to the system
   (a token/variant), don't bypass it locally.

## Negative signal
A hardcoded color or magic spacing value in a component is a compliance failure —
route it through the tokens.
