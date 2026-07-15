import type {
  AwsStatusResponse,
  ProviderId,
  SettingsResponse,
  SettingsUpdate
} from "@learning-hub/shared";
import { Cloud, FolderOpen, Route, Settings } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { AwsBanner } from "../components/AwsBanner.js";
import { CopyIcon } from "../components/icons.js";
import {
  Badge,
  Button,
  card,
  field,
  Input,
  InlineNotice,
  ReadOnlyField,
  Select,
  SectionHeader,
  ShellSkeleton
} from "../components/ui.js";
import {
  awsStatusText,
  configuredAwsLoginCommand,
  providerLabel,
  type AwsLoginStatus
} from "../lib.js";

const DEFAULT_CONVERSE_MODEL_ID = "us.anthropic.claude-sonnet-5";

function SettingsSection({
  actions,
  children,
  description,
  icon,
  title
}: {
  actions?: ReactNode;
  children: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  title: string;
}) {
  return (
    <section className={`${card} grid min-w-0 gap-4 p-4`}>
      <div className="grid min-w-0 gap-2">
        <SectionHeader
          actions={actions ? <div className="hidden sm:block">{actions}</div> : undefined}
          as="h2"
          icon={icon}
          title={title}
          tone="neutral"
        />
        {description ? (
          <p className="max-w-2xl text-[13px] leading-6 text-muted-foreground">{description}</p>
        ) : null}
        {actions ? <div className="sm:hidden [&>*]:w-full">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

function CopyableReadOnlyField({
  copied,
  label,
  onCopy,
  value
}: {
  copied: boolean;
  label: string;
  onCopy: () => void;
  value: string;
}) {
  return (
    <div className="grid gap-1 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <div className={`${field} flex min-h-10 items-center gap-2 py-2.5`}>
        <code className="min-w-0 flex-1 break-all font-mono text-[13px] text-muted-foreground">
          {value}
        </code>
        <Button
          aria-label="Copy login command"
          className="shrink-0"
          onClick={onCopy}
          size="icon-xs"
          title={copied ? "Copied" : "Copy"}
          type="button"
          variant="ghost"
        >
          <CopyIcon size={13} />
        </Button>
      </div>
    </div>
  );
}

function awsTone(status: AwsStatusResponse | undefined): "neutral" | "success" | "warning" {
  if (!status) {
    return "neutral";
  }

  return status.ok ? "success" : "warning";
}

function FixedConverseModel() {
  return (
    <div className="grid min-w-0 gap-1.5 text-sm">
      <span className="font-medium text-foreground">Bedrock Converse model</span>
      <div
        aria-readonly="true"
        className={`${field} flex items-center overflow-hidden font-mono text-[13px]`}
      >
        <span className="truncate">{DEFAULT_CONVERSE_MODEL_ID}</span>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        Sonnet 5 is used automatically for Bedrock Converse.
      </p>
    </div>
  );
}

export function SettingsPage({
  awsLoginMessage,
  awsLoginStatus,
  awsStatus,
  onAwsLogin,
  onSaveSettings,
  saveStatus,
  settings
}: {
  awsLoginMessage?: string;
  awsLoginStatus: AwsLoginStatus;
  awsStatus?: AwsStatusResponse;
  onAwsLogin: () => void;
  onSaveSettings: (update: SettingsUpdate) => void;
  saveStatus?: "idle" | "saving" | "saved" | "error";
  settings?: SettingsResponse;
}) {
  const [defaultProvider, setDefaultProvider] = useState<ProviderId>(
    settings?.defaultProvider ?? "bedrock-mantle"
  );
  const [mantleModelId, setMantleModelId] = useState(
    settings?.mantleModelId ?? "openai.gpt-5.6-sol"
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (settings) {
      setDefaultProvider(settings.defaultProvider);
      setMantleModelId(settings.mantleModelId);
    }
  }, [settings]);

  if (!settings) {
    return (
      <div className="mx-auto grid w-full max-w-3xl gap-6">
        <SectionHeader as="h1" icon={<Settings size={17} />} title="Settings" />
        <ShellSkeleton />
      </div>
    );
  }

  const loginCommand = configuredAwsLoginCommand(settings, awsStatus);
  const awsStatusDetail = awsStatus && !awsStatus.ok ? awsStatus.message : null;

  return (
    <div className="mx-auto grid w-full min-w-0 max-w-3xl gap-5">
      <header className="grid min-w-0 gap-1">
        <SectionHeader as="h1" icon={<Settings size={17} />} title="Settings" />
        <p className="max-w-2xl break-words text-sm leading-6 text-muted-foreground">
          Local setup: the folder that holds your topic workspaces and the AWS profile used for
          Bedrock.
        </p>
      </header>

      <AwsBanner
        loginMessage={awsLoginMessage}
        loginStatus={awsLoginStatus}
        onAwsLogin={onAwsLogin}
        settings={settings}
        status={awsStatus}
      />

      <SettingsSection
        description="Local topic folders and optional search configuration. Secret values stay server-side."
        icon={<FolderOpen size={16} />}
        title="Learning workspace"
      >
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <ReadOnlyField
            className="sm:col-span-2"
            label="Learning hub folder"
            value={settings.workspaceDir ?? "Not configured"}
            valueClassName="font-mono text-[13px]"
          />
          <ReadOnlyField
            label="Web search (Tavily)"
            value={
              settings.tavilyConfigured ? (
                <Badge tone="success">Configured</Badge>
              ) : (
                <Badge>Not configured</Badge>
              )
            }
          />
        </div>
        {!settings.workspaceDir ? (
          <InlineNotice
            body="Set LEARNING_HUB_DIR in learning-hub-app/.env, then restart the dev server."
            title="Learning hub folder is missing"
          />
        ) : null}
      </SettingsSection>

      <SettingsSection
        actions={
          <Button
            aria-busy={awsLoginStatus === "running"}
            disabled={awsLoginStatus === "running"}
            onClick={onAwsLogin}
            size="sm"
            type="button"
            variant="secondary"
          >
            {awsLoginStatus === "running" ? "Running login" : "Run AWS login"}
          </Button>
        }
        description="The tutor uses this local AWS profile and region for Bedrock calls."
        icon={<Cloud size={16} />}
        title="Bedrock authentication"
      >
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <ReadOnlyField
            label="Status"
            value={<Badge tone={awsTone(awsStatus)}>{awsStatusText(awsStatus)}</Badge>}
          />
          <ReadOnlyField
            label="AWS profile"
            value={settings.awsProfile ?? "Default chain"}
            valueClassName="font-mono text-[13px]"
          />
          <ReadOnlyField
            label="Region"
            value={settings.awsRegion}
            valueClassName="font-mono text-[13px]"
          />
          <div className="sm:col-span-2">
            <CopyableReadOnlyField
              copied={copied}
              label="Login command"
              onCopy={() => {
                if (typeof navigator !== "undefined" && navigator.clipboard) {
                  void navigator.clipboard.writeText(loginCommand).then(() => setCopied(true));
                }
              }}
              value={loginCommand}
            />
          </div>
        </div>
        {awsStatusDetail ? (
          <InlineNotice tone="warning" title="AWS needs attention" body={awsStatusDetail} />
        ) : null}
        {awsLoginMessage ? (
          <InlineNotice
            body={awsLoginMessage}
            title={awsLoginStatus === "failed" ? "AWS login failed" : "AWS login status"}
            tone={awsLoginStatus === "failed" ? "error" : "neutral"}
          />
        ) : null}
      </SettingsSection>

      <details className={`${card} min-w-0 overflow-hidden`}>
        <summary className="cursor-pointer list-none p-4 hover:bg-secondary/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <SectionHeader
            actions={
              <Badge className="hidden sm:inline-flex">{providerLabel(defaultProvider)}</Badge>
            }
            as="h2"
            icon={<Route size={16} />}
            title="Advanced model routing"
            tone="neutral"
          />
          <Badge className="mt-2 sm:hidden">{providerLabel(defaultProvider)}</Badge>
          <p className="mt-2 max-w-3xl text-[13px] leading-6 text-muted-foreground">
            Bedrock Mantle uses GPT-5.6 Sol with medium reasoning by default. Switch routes here
            when you intentionally want Bedrock Converse with Sonnet 5.
          </p>
        </summary>

        <form
          className="grid gap-5 border-t border-border p-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSaveSettings({
              defaultProvider,
              converseModelId: DEFAULT_CONVERSE_MODEL_ID,
              mantleModelId: mantleModelId.trim() || undefined
            });
          }}
        >
          <div className="grid min-w-0 gap-4 lg:grid-cols-2 lg:items-start">
            <div className="grid min-w-0 gap-1.5 text-sm">
              <label className="font-medium text-foreground" htmlFor="settings-default-provider">
                Default provider
              </label>
              <Select
                className={field}
                id="settings-default-provider"
                onChange={(event) => setDefaultProvider(event.currentTarget.value as ProviderId)}
                value={defaultProvider}
              >
                <option value="bedrock-converse">Bedrock Converse</option>
                <option value="bedrock-mantle">Bedrock Mantle</option>
              </Select>
              <p className="text-xs leading-5 text-muted-foreground">
                Choose the Bedrock route used by new tutor and lesson-generation requests.
              </p>
            </div>

            {defaultProvider === "bedrock-converse" ? (
              <FixedConverseModel />
            ) : (
              <div className="grid min-w-0 gap-1.5 text-sm">
                <label className="font-medium text-foreground" htmlFor="settings-mantle-model">
                  Bedrock Mantle model
                </label>
                <Input
                  className={`${field} font-mono text-[13px]`}
                  id="settings-mantle-model"
                  onChange={(event) => setMantleModelId(event.currentTarget.value)}
                  value={mantleModelId}
                />
                <p className="text-xs leading-5 text-muted-foreground">
                  GPT-5.6 Sol requests use medium reasoning effort. This is a model id, not a
                  secret.
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              aria-busy={saveStatus === "saving"}
              disabled={saveStatus === "saving"}
              type="submit"
            >
              {saveStatus === "saving" ? "Saving advanced settings" : "Save advanced settings"}
            </Button>
          </div>
          {saveStatus === "saved" ? (
            <InlineNotice
              body="Advanced model routing was saved locally."
              title="Advanced settings saved."
            />
          ) : null}
          {saveStatus === "error" ? (
            <InlineNotice
              tone="error"
              title="Settings need attention"
              body="Advanced settings could not be saved. Check the local API and try again."
            />
          ) : null}
        </form>
      </details>
    </div>
  );
}
