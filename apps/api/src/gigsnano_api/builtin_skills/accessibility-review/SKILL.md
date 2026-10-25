---
name: accessibility-review
version: 1.0.0
description: Check a UI change for keyboard, semantics, contrast and labelling before it ships.
---

# Accessibility Review

**Use when:** a UI change is written and about to be verified.
**Not for:** non-UI changes.

## Checklist
1. **Semantics:** real elements (`button`, `nav`, `a`, headings) over `div` +
   `role=`; one `h1`; landmarks present.
2. **Keyboard:** every interactive element is reachable and operable by keyboard,
   focus is visible, focus order is logical, no traps.
3. **Labels:** inputs have associated labels; icon-only controls have an
   `aria-label`; images have meaningful `alt` (or `alt=""` when decorative).
4. **Contrast:** text meets WCAG AA against its background in both themes.
5. **Motion/state:** respect reduced-motion; convey state by more than color.

## Negative signal
An interactive `div` with an `onClick` and no keyboard handler or role fails —
use a `button`.
