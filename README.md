# L2Anything

L2Anything is a private, local learning workspace. It organizes topic missions, lessons, tutor conversations, active-recall quizzes, learning records, resources, and review queues in one browser app.

The web app binds to `127.0.0.1`. Topic files and SQLite state stay on the local machine. AWS credentials are read from the standard AWS credential chain and are never stored by the app.

## Requirements

- Windows, macOS, or Linux
- Node.js 22, 23, or 24
- Git
- AWS CLI v2
- An AWS account with Amazon Bedrock access

## Install

```powershell
git clone <repository-url>
cd <repository-folder>\learning-hub-app
corepack pnpm install
```

Use `corepack pnpm` in the commands below. A separate global pnpm installation is not required.

## Configure AWS

Create an AWS profile if you do not already have one:

```powershell
aws configure sso --profile l2anything
aws sso login --profile l2anything
```

The selected role needs permission to call:

- `sts:GetCallerIdentity`
- `bedrock:ListFoundationModels`
- `bedrock:InvokeModel`
- `bedrock:InvokeModelWithResponseStream`

Enable access to at least one supported text model in the Amazon Bedrock console for the region you plan to use.

## Configure Local Data

From `learning-hub-app`:

```powershell
Copy-Item .env.example .env
New-Item -ItemType Directory -Force ..\local-learning-hub
```

Edit `.env` and replace the example paths with absolute paths on your machine:

```ini
LEARNING_HUB_DIR=C:/path/to/repository/local-learning-hub
AWS_PROFILE=l2anything
AWS_REGION=us-east-2
AWS_LOGIN_COMMAND=
DEFAULT_PROVIDER=bedrock-mantle
CONVERSE_MODEL_ID=
MANTLE_MODEL_ID=openai.gpt-5.6-sol
MANTLE_BASE_URL=
TAVILY_API_KEY=
PORT=8787
DB_PATH=C:/path/to/repository/data/l2anything-local.sqlite
```

`LEARNING_HUB_DIR` must point to a directory that contains topic folders. Do not point it at the repository root. The `local-learning-hub/` directory, `.env`, and SQLite files are ignored by Git.

`TAVILY_API_KEY` is optional. Without it, the tutor can still use saved resources and direct URL fetching.

The default Bedrock Mantle route uses GPT-5.6 Sol with medium reasoning effort. You can change
providers or model IDs from **Settings > Advanced model routing**.

## Run

```powershell
corepack pnpm dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173).

On first use:

1. Open **Settings** and confirm that AWS is connected.
2. Refresh the available models and select a model or inference profile.
3. Open **New topic** and complete the mission interview.
4. Generate a lesson, complete it, and take the quiz to begin the review schedule.

Tutor chat is embedded in each lesson view.

Stop the app with `Ctrl+C`.

## Try the Synthetic Workspace

The repository includes generic sample topics for UI testing. Set these values in `.env`, using the absolute path to your clone:

```ini
LEARNING_HUB_DIR=C:/path/to/repository/data/l2anything-synthetic-workspace
DB_PATH=C:/path/to/repository/data/l2anything-demo.sqlite
```

Start the app once so it indexes the topics. To add sample due-review rows, open another terminal in `learning-hub-app` and run:

```powershell
corepack pnpm seed:synthetic-review
```

Use a different SQLite file when switching between demo and real workspaces.

## Local Data Layout

The app creates topic directories in this shape:

```text
local-learning-hub/
  topic-name/
    MISSION.md
    NOTES.md
    RESOURCES.md
    lessons/
    learning-records/
    reference/
```

Topic files are the durable learning workspace. SQLite stores app state such as lesson status, quizzes, review scheduling, and chat history. Back up both the workspace directory and the configured SQLite file if you want a complete backup.

## Validation

Run these commands from `learning-hub-app`:

```powershell
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm build
```

The visual regression suite requires the app to be running:

```powershell
corepack pnpm test:ui
```

## Troubleshooting

- **`pnpm` is not recognized:** use `corepack pnpm`, as shown above.
- **AWS session expired:** run `aws sso login --profile <profile>` and retry from Settings.
- **No models appear:** verify the AWS region, Bedrock model access, and IAM permissions.
- **No topics appear:** verify that `LEARNING_HUB_DIR` exists and contains topic subdirectories.
- **Port already in use:** stop the previous dev process before starting another.
- **Stale local state:** stop the app, remove the configured SQLite file, and restart. Topic files remain on disk, but app-only history and scheduling state will be rebuilt or lost.

## Privacy Notes

- Never commit `.env`, SQLite files, AWS credentials, or real learner workspaces.
- The included sample workspace is synthetic.
- LLM requests are sent to the configured Amazon Bedrock model. Review your AWS account's data-handling requirements before using sensitive learning material.
- The app is designed for one local user and has no multi-user authentication or deployment configuration.
