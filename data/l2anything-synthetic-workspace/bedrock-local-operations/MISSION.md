# Mission: Bedrock Local Operations

## Why

Debug local Bedrock-backed development without guessing whether a failure is credentials, model routing, network, or app code.

## Success looks like

- Read an AWS auth error and choose the next command.
- Separate provider configuration problems from tutor-agent bugs.
- Keep local smoke tests synthetic and repeatable.

## Constraints

- Do not use real account identifiers in notes or tests.
- Prefer commands that work on Windows PowerShell.
- Keep secrets out of the workspace.

## Out of scope

- Production deployment.
- IAM policy design beyond local diagnosis.
