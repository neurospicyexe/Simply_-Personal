---
name: plan-status
description: Summarize the current completion status of all PluralHost implementation plans by reading docs/superpowers/plans/ and recent git log. Outputs a status table and flags any plan marked COMPLETE that may have recent regression commits.
user-invocable: false
---

Read all `.md` files in `docs/superpowers/plans/` and `docs/superpowers/specs/` to identify all plans and their documented status (COMPLETE / IN-PROGRESS / TODO / SKIPPED).

Then run:
```bash
git -C /c/dev/simply-personal log --oneline -40
```

Cross-reference the git log against each plan's domain to detect potential regression zones — i.e., plans marked COMPLETE that have recent commits still touching their core files.

Output a markdown table:

| Plan | File | Status | Regression Risk |
|------|------|--------|-----------------|
| Plan 1 — DB schema + crisis shield | 2026-03-11-... | COMPLETE | none |
| ... | ... | ... | ... |

After the table, list any plans with HIGH regression risk (commits in last 10 touching their domain) with a brief note on what changed.

Finally, note what the next planned work is based on the "Next — Future Work" section in CLAUDE.md.
