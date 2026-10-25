---
name: api-design
version: 1.0.0
description: Design endpoints that are consistent, tenant-safe, and validated, matching the service's existing conventions.
---

# API Design

**Use when:** adding or changing a backend endpoint or service contract.
**Not for:** frontend-only or pure-logic changes with no interface.

## Steps
1. Match the existing API shape: routing, naming, auth dependency, error format,
   and response schema. Read a sibling endpoint and follow it.
2. Validate input at the boundary (typed schema); reject bad input with a clear
   4xx, never a 500.
3. Enforce authorization and tenant scoping on every endpoint — a resource not
   owned by the caller returns 404 (no existence oracle), not an unguarded read.
4. Keep write operations idempotent where a client may retry; make failure modes
   explicit.
5. Return only what the caller needs; never leak another tenant's data or
   internal secrets.

## Negative signal
A new endpoint that skips the tenant/ownership check, or trusts unvalidated
input, is a security defect — gate and validate it.
