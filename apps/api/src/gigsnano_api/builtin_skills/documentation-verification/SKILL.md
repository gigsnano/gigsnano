---
name: documentation-verification
version: 1.0.0
description: Confirm documentation matches the actual behaviour of the code it describes.
---

# Documentation Verification

**Use when:** docs were written or changed, or code changed in a way that could
make existing docs wrong.
**Not for:** first-draft authoring (use technical-writing).

## Checklist
1. Every command, code snippet, and config example runs as written — execute
   them, don't assume.
2. API/signature docs match the current code (names, params, return shapes).
3. Links resolve; referenced files and paths exist.
4. Version/prerequisite claims are current.
5. The described behaviour matches what the code actually does — where they
   diverge, the code is the truth; fix the docs.

## Negative signal
A doc that describes a removed flag or an old signature is a defect — update it.
