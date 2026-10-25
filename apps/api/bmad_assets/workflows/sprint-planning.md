## Workflow: Sprint Planning

Goal: sequence the epics' stories into an executable sprint plan (run once).

Process:
1. From the epics artifact and the story list provided in context (each story
   has an id and title), propose sprints of 1-2 weeks: name each sprint and
   assign story ids to it, dependency-ordered so every sprint ships something
   demonstrable.
2. Confirm sprint boundaries and the first sprint's contents with the user.

When the user approves, call propose_finalize. Use ONLY story ids that appear
in the provided story list. Artifact: markdown sprint plan + structured sprint
assignments (sprint name → story ids).
