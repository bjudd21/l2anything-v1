import type {
  AwsProfile,
  AwsProfileCreate,
  SettingsResponse,
  SetupUpdate
} from "@learning-hub/shared";
import { ArrowRight, Cloud, GraduationCap, LogIn, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createAwsProfile, fetchAwsProfiles, runAwsLogin } from "../api.js";
import { Button, field, InlineNotice, Input, Select } from "../components/ui.js";

const CREATE_PROFILE = "__create__";
const DEFAULT_CHAIN = "__default__";

export function SetupPage({
  onCancel,
  onSave,
  settings
}: {
  onCancel?: () => void;
  onSave: (update: SetupUpdate) => Promise<void>;
  settings: SettingsResponse;
}) {
  const [profiles, setProfiles] = useState<AwsProfile[]>([]);
  const [profilesStatus, setProfilesStatus] = useState<"loading" | "ready" | "error">("loading");
  const [profileChoice, setProfileChoice] = useState(settings.awsProfile ?? "");
  const [awsRegion, setAwsRegion] = useState(settings.awsRegion);
  const [profileName, setProfileName] = useState("l2anything");
  const [ssoStartUrl, setSsoStartUrl] = useState("");
  const [ssoRegion, setSsoRegion] = useState(settings.awsRegion);
  const [accountId, setAccountId] = useState("");
  const [roleName, setRoleName] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [loginStatus, setLoginStatus] = useState<"idle" | "running" | "succeeded" | "failed">(
    "idle"
  );
  const [loginMessage, setLoginMessage] = useState("");
  const [error, setError] = useState("");

  const profileOptions = useMemo(() => {
    if (settings.awsProfile && !profiles.some((profile) => profile.name === settings.awsProfile)) {
      return [{ name: settings.awsProfile, region: settings.awsRegion }, ...profiles];
    }
    return profiles;
  }, [profiles, settings.awsProfile, settings.awsRegion]);

  const loadProfiles = () => {
    setProfilesStatus("loading");
    void fetchAwsProfiles()
      .then((response) => {
        if (!response.ok) {
          setProfilesStatus("error");
          setProfileChoice((current) => current || CREATE_PROFILE);
          return;
        }

        setProfiles(response.profiles);
        setProfilesStatus("ready");
        setProfileChoice((current) => {
          if (current) {
            return current;
          }

          const first = response.profiles[0];
          if (first?.region) {
            setAwsRegion(first.region);
          }
          return first?.name ?? CREATE_PROFILE;
        });
      })
      .catch(() => {
        setProfilesStatus("error");
        setProfileChoice((current) => current || CREATE_PROFILE);
      });
  };

  useEffect(loadProfiles, []);

  const creatingProfile = profileChoice === CREATE_PROFILE;
  const profileRequest = (): AwsProfileCreate => ({
    name: profileName,
    ssoStartUrl,
    ssoRegion,
    accountId,
    roleName,
    region: awsRegion
  });
  const resolveSelectedProfile = async () => {
    if (creatingProfile) {
      const created = await createAwsProfile(profileRequest());
      setProfiles((current) => [
        ...current.filter((profile) => profile.name !== created.profile.name),
        created.profile
      ]);
      setProfileChoice(created.profile.name);
      return created.profile.name;
    }

    return profileChoice === DEFAULT_CHAIN ? "" : profileChoice;
  };
  const handleAwsLogin = () => {
    setLoginStatus("running");
    setLoginMessage("");
    setError("");
    setStatus("idle");

    void resolveSelectedProfile()
      .then((profile) => runAwsLogin(profile))
      .then((login) => {
        setLoginStatus(login.ok ? "succeeded" : "failed");
        setLoginMessage(
          login.ok ? "AWS sign-in completed. Verify access to continue." : login.message
        );
      })
      .catch((reason: unknown) => {
        setLoginStatus("failed");
        setLoginMessage(
          reason instanceof Error ? reason.message : "AWS sign-in could not be started."
        );
      });
  };
  const needsSignIn =
    loginStatus !== "succeeded" &&
    (creatingProfile || status === "error" || loginStatus === "failed");
  const profilesPending = profilesStatus === "loading" && !profileChoice;

  return (
    <main className="workspace-canvas min-h-dvh w-full overflow-x-hidden px-4 py-6 text-foreground sm:px-6 sm:py-10">
      <div className="mx-auto grid w-full max-w-3xl gap-7">
        <header className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-md border border-primary/30 bg-primary text-primary-foreground shadow-lg shadow-primary/25">
            <GraduationCap size={21} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-muted-foreground">L2Anything</p>
            <h1 className="text-[24px] font-bold leading-tight text-foreground">
              Connect your AWS account
            </h1>
          </div>
        </header>

        <form
          className="overflow-hidden rounded-lg border border-border bg-card shadow-xl"
          onSubmit={(event) => {
            event.preventDefault();
            setStatus("saving");
            setError("");

            void (async () => {
              const awsProfile = await resolveSelectedProfile();
              await onSave({ awsProfile, awsRegion });
            })().catch((reason: unknown) => {
              setStatus("error");
              setError(reason instanceof Error ? reason.message : "AWS setup could not be saved.");
            });
          }}
        >
          <section className="grid gap-5 px-5 py-5 sm:px-6">
            <div className="flex min-w-0 gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-secondary/55 text-muted-foreground">
                <Cloud size={16} />
              </span>
              <div className="min-w-0">
                <h2 className="text-[15px] font-bold text-foreground">AWS profile</h2>
                <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
                  Select a profile already configured on this computer or create an SSO profile.
                </p>
              </div>
            </div>

            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <label className="grid min-w-0 gap-1.5 text-sm" htmlFor="setup-aws-profile">
                <span className="flex items-center justify-between gap-2 font-medium text-foreground">
                  Profile
                  <Button
                    aria-label="Refresh AWS profiles"
                    disabled={profilesStatus === "loading"}
                    onClick={loadProfiles}
                    size="icon-xs"
                    title="Refresh AWS profiles"
                    type="button"
                    variant="ghost"
                  >
                    <RefreshCw size={13} />
                  </Button>
                </span>
                <Select
                  className={field}
                  id="setup-aws-profile"
                  onChange={(event) => {
                    const next = event.currentTarget.value;
                    setProfileChoice(next);
                    setStatus("idle");
                    setLoginStatus("idle");
                    setLoginMessage("");
                    setError("");
                    const profile = profiles.find((item) => item.name === next);
                    if (profile?.region) {
                      setAwsRegion(profile.region);
                    }
                  }}
                  value={profileChoice}
                >
                  {profilesStatus === "loading" && !profileChoice ? (
                    <option value="">Loading profiles</option>
                  ) : null}
                  {profileOptions.map((profile) => (
                    <option key={profile.name} value={profile.name}>
                      {profile.name}
                    </option>
                  ))}
                  <option value={DEFAULT_CHAIN}>Use default credential chain</option>
                  <option value={CREATE_PROFILE}>Create a new SSO profile</option>
                </Select>
              </label>

              <label className="grid min-w-0 gap-1.5 text-sm" htmlFor="setup-aws-region">
                <span className="font-medium text-foreground">Bedrock region</span>
                <Input
                  autoComplete="off"
                  className={`${field} font-mono text-[13px]`}
                  id="setup-aws-region"
                  onChange={(event) => {
                    setAwsRegion(event.currentTarget.value);
                    setStatus("idle");
                    setLoginStatus("idle");
                    setLoginMessage("");
                  }}
                  required
                  spellCheck={false}
                  value={awsRegion}
                />
              </label>
            </div>

            {profilesStatus === "error" ? (
              <InlineNotice
                body="No local profiles were detected. You can create an SSO profile below."
                title="AWS profiles were not found"
                tone="warning"
              />
            ) : null}
          </section>

          {creatingProfile ? (
            <section className="grid gap-4 border-t border-border px-5 py-5 sm:px-6">
              <div>
                <h2 className="text-[15px] font-bold text-foreground">New SSO profile</h2>
                <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
                  These values are written to the standard AWS CLI configuration.
                </p>
              </div>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <label className="grid min-w-0 gap-1.5 text-sm" htmlFor="setup-profile-name">
                  <span className="font-medium text-foreground">Profile name</span>
                  <Input
                    autoComplete="off"
                    className={field}
                    id="setup-profile-name"
                    onChange={(event) => setProfileName(event.currentTarget.value)}
                    required
                    value={profileName}
                  />
                </label>
                <label className="grid min-w-0 gap-1.5 text-sm" htmlFor="setup-sso-region">
                  <span className="font-medium text-foreground">SSO region</span>
                  <Input
                    autoComplete="off"
                    className={`${field} font-mono text-[13px]`}
                    id="setup-sso-region"
                    onChange={(event) => setSsoRegion(event.currentTarget.value)}
                    required
                    value={ssoRegion}
                  />
                </label>
                <label
                  className="grid min-w-0 gap-1.5 text-sm sm:col-span-2"
                  htmlFor="setup-sso-url"
                >
                  <span className="font-medium text-foreground">SSO start URL</span>
                  <Input
                    autoComplete="off"
                    className={field}
                    id="setup-sso-url"
                    onChange={(event) => setSsoStartUrl(event.currentTarget.value)}
                    placeholder="https://your-company.awsapps.com/start"
                    required
                    type="url"
                    value={ssoStartUrl}
                  />
                </label>
                <label className="grid min-w-0 gap-1.5 text-sm" htmlFor="setup-account-id">
                  <span className="font-medium text-foreground">AWS account ID</span>
                  <Input
                    autoComplete="off"
                    className={`${field} font-mono text-[13px]`}
                    id="setup-account-id"
                    inputMode="numeric"
                    maxLength={12}
                    onChange={(event) => setAccountId(event.currentTarget.value)}
                    required
                    value={accountId}
                  />
                </label>
                <label className="grid min-w-0 gap-1.5 text-sm" htmlFor="setup-role-name">
                  <span className="font-medium text-foreground">Role name</span>
                  <Input
                    autoComplete="off"
                    className={field}
                    id="setup-role-name"
                    onChange={(event) => setRoleName(event.currentTarget.value)}
                    required
                    value={roleName}
                  />
                </label>
              </div>
            </section>
          ) : null}

          <div className="grid gap-4 border-t border-border bg-secondary/20 px-5 py-5 sm:flex sm:items-center sm:justify-between sm:px-6">
            <p className="flex items-center gap-2 text-xs leading-5 text-muted-foreground">
              <ShieldCheck className="shrink-0 text-success" size={15} />
              Setup verifies identity and Bedrock Converse access without storing AWS credentials.
            </p>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              {onCancel ? (
                <Button
                  disabled={status === "saving"}
                  onClick={onCancel}
                  type="button"
                  variant="ghost"
                >
                  Cancel
                </Button>
              ) : null}
              {profilesPending ? (
                <Button disabled type="button">
                  <RefreshCw className="animate-spin" size={15} />
                  Finding AWS profiles
                </Button>
              ) : needsSignIn ? (
                <Button
                  aria-busy={loginStatus === "running"}
                  disabled={status === "saving" || loginStatus === "running" || !profileChoice}
                  onClick={handleAwsLogin}
                  type="button"
                >
                  <LogIn size={15} />
                  {loginStatus === "running"
                    ? "Waiting for AWS"
                    : creatingProfile
                      ? "Create profile and sign in"
                      : loginStatus === "failed"
                        ? "Try AWS sign-in again"
                        : "Sign in with AWS"}
                </Button>
              ) : (
                <Button
                  aria-busy={status === "saving"}
                  disabled={status === "saving" || !profileChoice}
                  type="submit"
                >
                  {status === "saving" ? "Verifying AWS access" : "Verify and open L2Anything"}
                  <ArrowRight size={15} />
                </Button>
              )}
            </div>
          </div>

          {status === "error" ? (
            <div className="border-t border-border px-5 py-4 sm:px-6">
              <InlineNotice body={error} title="AWS setup needs attention" tone="error" />
            </div>
          ) : null}
          {loginMessage ? (
            <div className="border-t border-border px-5 py-4 sm:px-6">
              <InlineNotice
                body={loginMessage}
                title={loginStatus === "succeeded" ? "AWS sign-in complete" : "AWS sign-in failed"}
                tone={loginStatus === "succeeded" ? "neutral" : "error"}
              />
            </div>
          ) : null}
        </form>
      </div>
    </main>
  );
}
