# L2Anything Synthetic Workspace

Synthetic workspace data for local UI, route, and visual-regression testing.

Use this directory as `LEARNING_HUB_DIR` when you want a populated L2Anything workspace without touching a real learning workspace:

```powershell
$env:LEARNING_HUB_DIR="<repo>\data\l2anything-synthetic-workspace"
$env:DB_PATH="<repo>\data\l2anything-dev.sqlite"
corepack pnpm dev
```

What this fixture seeds:

- Topics with teach-skill-compatible `MISSION.md`
- Multiple lesson HTML files, including code-heavy lessons
- Learning records with markdown and fenced code
- `RESOURCES.md` source lists
- Reference HTML docs for the Reference page

What this fixture does not seed:

- Lesson completion status
- Lesson due dates
- Review queue items
- Topic groups

Those are SQLite application state, not workspace files. To seed due review rows for local visual testing, run:

```powershell
corepack pnpm seed:synthetic-review
```
