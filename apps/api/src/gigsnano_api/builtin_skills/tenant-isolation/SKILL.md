---
name: tenant-isolation
version: 1.0.0
description: Keep a new endpoint from leaking across workspaces or projects — access is enforced per route, not by a single choke point.
---

# Tenant Isolation

**Use when:** adding or changing anything that reads or writes project- or
workspace-scoped data — an endpoint, an MCP tool, a background task, a file path.
**Not for:** pure computation over data a caller already legitimately holds.

## The trap
There is **no single choke point**. Access is gated per route, so a new endpoint
that forgets the check compiles, passes its happy-path test, and quietly serves
another tenant's rows. Copying the endpoint next door is not proof — some of them
predate the rule.

## Rules
1. **Resolve the entity through the guarded helper**, never by bare primary key:
   `get_project_or_404`, `user_is_project_member`, `accessible_project_ids`.
   The lookup and the permission check must be the same operation.
2. **404, not 403, for something the caller cannot see.** A 403 confirms the row
   exists — that is an existence leak. Reserve 403 for "you can see it but may
   not do this".
3. **Check the role for the verb, not just membership.** Read, write and
   danger-zone actions have different requirements; a member is not an owner.
4. **List endpoints filter at the query**, never in Python after the fetch. A
   post-filter is one early `return` away from leaking the whole table.
5. **Filesystem paths are containment-checked** — resolve, then assert the result
   is inside the tenant's base directory (`relative_to(base)`). Archive members
   and user-supplied names both traverse.
6. **Background tasks re-derive the tenant** from the record they were handed.
   They run without a request context; nothing else will catch the mistake.

## Verification
Write the negative test in the same commit: a second workspace's user calling the
new route gets 404 and no data. A feature is not isolated until that test exists
and fails when the guard is removed.

## Evidence to attach
The negative-path test and its output.
