# Learning Hub Visual Fixture

Synthetic workspace data for local UI, route, and visual-regression testing.

Use this directory as `LEARNING_HUB_DIR` when you want a populated Learning Hub without touching a real learning workspace:

```powershell
$env:LEARNING_HUB_DIR="<repo>\learning-hub-app\apps\server\src\test\fixtures\learning-hub-visual-fixture"
$env:AWS_PROFILE="learning-dev"
pnpm dev
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

Those are SQLite application state, not workspace files. Exercise them through UI actions, API tests, or a mocked API visual-smoke script.
