import type { AwsStatusResponse, SettingsResponse } from "@learning-hub/shared";
import { useState } from "react";
import { awsStatusText, configuredAwsLoginCommand, type AwsLoginStatus } from "../lib.js";
import { CloudIcon, CopyIcon } from "./icons.js";
import { Button } from "./ui.js";

export function AwsBanner({
  loginMessage,
  loginStatus,
  onAwsLogin,
  settings,
  status
}: {
  loginMessage?: string;
  loginStatus: AwsLoginStatus;
  onAwsLogin: () => void;
  settings?: SettingsResponse;
  status?: AwsStatusResponse;
}) {
  const [copied, setCopied] = useState(false);

  if (!status || status.ok) {
    return null;
  }

  const command = configuredAwsLoginCommand(settings, status);
  const loginRunning = loginStatus === "running";

  return (
    <section
      aria-live="polite"
      className="max-w-full overflow-hidden rounded-lg border border-warning/35 bg-warning-soft/70 px-4 py-3 text-sm text-foreground shadow-lg backdrop-blur-xl"
      role="status"
    >
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 gap-3">
          <CloudIcon className="mt-0.5 shrink-0 text-warning" size={18} />
          <div className="min-w-0">
            <div className="font-semibold">{awsStatusText(status)}</div>
            <p className="mt-1 leading-6 text-muted-foreground">
              Tutor actions are paused. Run
              <code className="mx-1 mt-1 inline-block max-w-full break-all rounded-md border border-border bg-card/60 px-1.5 py-0.5 text-foreground">
                {command}
              </code>
              to reconnect. Reading lessons still works.
            </p>
            {loginMessage ? (
              <p className="mt-2 text-sm font-medium text-foreground">{loginMessage}</p>
            ) : null}
          </div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Button
            aria-busy={loginRunning}
            className="w-full sm:w-auto"
            disabled={loginRunning}
            onClick={onAwsLogin}
            type="button"
            variant="secondary"
          >
            {loginRunning ? "Running login" : "Run login"}
          </Button>
          <Button
            className="w-full sm:w-auto"
            onClick={() => {
              if (typeof navigator !== "undefined" && navigator.clipboard) {
                void navigator.clipboard.writeText(command).then(() => setCopied(true));
              }
            }}
            type="button"
            variant="secondary"
          >
            <CopyIcon size={14} />
            {copied ? "Copied" : "Copy command"}
          </Button>
        </div>
      </div>
    </section>
  );
}
