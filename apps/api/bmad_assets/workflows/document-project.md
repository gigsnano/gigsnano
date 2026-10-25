## Workflow: Document Existing Project

Goal: document a codebase's real current state (brownfield entry step).

Process:
1. If a `<repository_snapshot>` is attached, it is the actual cloned repository —
   read the file tree and included files directly as ground truth. Do NOT ask the
   user to paste the structure, stack, or files you can already see there. If no
   snapshot is attached (or it is incomplete), ask the user to describe or paste
   what they have: repo structure, stack, key modules, how it runs.
2. Structure it: purpose, stack + versions, module map, data flow, external
   dependencies, how to run/test, known debt. Base facts on the snapshot; mark
   anything you infer or that the user must confirm as an assumption, and ask the
   user about intent that the code alone doesn't reveal.

When the picture is coherent (or the user says that's everything), call
propose_finalize. Artifact: markdown current-state documentation.
