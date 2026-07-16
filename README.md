# L2Anything

[![CI](https://github.com/bjudd21/l2anything-v1/actions/workflows/ci.yml/badge.svg)](https://github.com/bjudd21/l2anything-v1/actions/workflows/ci.yml)

L2Anything is a local learning app that creates lessons, quizzes, tutoring, and review schedules with Amazon Bedrock. Workspace files and app state are stored on your computer; generation requests are sent to your configured Bedrock model.

## What You Need

- [Node.js](https://nodejs.org/) 22 through 24
- [Git](https://git-scm.com/)
- [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
- An AWS account with Claude Sonnet 5 access through Amazon Bedrock

## Install and Start

Open a terminal and run:

```shell
git clone https://github.com/bjudd21/l2anything-v1.git
cd l2anything-v1/learning-hub-app
corepack pnpm install
corepack pnpm dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173) in your browser.

Use `corepack pnpm` as shown. You do not need to install pnpm separately.

## First Launch

The setup screen handles AWS configuration:

1. Select an existing AWS profile, or create an AWS SSO profile.
2. If the profile uses SSO, select **Sign in with AWS**.
3. Confirm the Bedrock region, then select **Save and open L2Anything**.
4. Complete the mission interview, create a topic, and generate its first lesson.

Saving setup verifies the AWS identity and makes a short Claude Sonnet 5 request through Bedrock Converse. Normal setup does not require an `.env` file, a workspace path, or model selection.

L2Anything creates its workspace automatically at `learning-hub-app/local-learning-hub`.

## Start It Again Later

Open a terminal in `l2anything-v1/learning-hub-app` and run:

```shell
corepack pnpm dev
```

Then open [http://127.0.0.1:5173](http://127.0.0.1:5173). Stop the app with `Ctrl+C`.

## Troubleshooting

- **`pnpm` is not recognized:** Run `corepack pnpm dev`, not `pnpm dev`.
- **AWS sign-in expired:** Use **Run AWS login** in **Settings**, or run `aws sso login --profile <profile-name>`.
- **AWS setup fails:** Confirm the selected profile and region can use Claude Sonnet 5 with `bedrock:InvokeModelWithResponseStream`.
- **The page does not load:** Wait for Vite at `http://127.0.0.1:5173` and the server at `http://127.0.0.1:8787`, then refresh.
- **A port is already in use:** Stop the earlier `corepack pnpm dev` process with `Ctrl+C`.

## Local Data and Privacy

- Learning files: `learning-hub-app/local-learning-hub`
- App database: `learning-hub-app/apps/server/.data/learning-hub.sqlite`
- The web app and API listen only on `127.0.0.1`.
- The app uses the AWS CLI and SDK credential chain; it does not store AWS credentials.
- Bedrock receives prompts and relevant learning context when generating content or tutor replies.
- The app is intended for one local user and does not provide multi-user authentication.
- Do not commit the SQLite database, AWS credentials, or personal learning files.

## Project Checks

Run these from `learning-hub-app`:

```shell
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm build
```
