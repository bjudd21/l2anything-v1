import type { AwsStatusResponse } from "@learning-hub/shared";

type AwsStatusError = Extract<AwsStatusResponse, { ok: false }>;

export function errorName(error: unknown) {
  if (error && typeof error === "object" && "name" in error && typeof error.name === "string") {
    return error.name;
  }

  return "";
}

export function errorMessage(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "";
}

function deniedAction(message: string) {
  return message.match(/perform:\s*([A-Za-z0-9:_*-]+)/i)?.[1];
}

export function classifyAwsCredentialError(error: unknown): AwsStatusError {
  const name = errorName(error);
  const message = errorMessage(error);
  const haystack = `${name} ${message}`.toLowerCase();

  if (
    haystack.includes("tokenrefreshrequired") ||
    haystack.includes("sso session") ||
    (haystack.includes("token") && haystack.includes("expired"))
  ) {
    return {
      ok: false,
      reason: "sso_expired",
      region: "",
      profile: null,
      message: "AWS SSO credentials expired. Run aws sso login for the configured profile."
    };
  }

  if (
    haystack.includes("credentialsprovidererror") ||
    haystack.includes("could not load credentials") ||
    haystack.includes("no credentials") ||
    (haystack.includes("profile") && haystack.includes("could not be found"))
  ) {
    return {
      ok: false,
      reason: "no_credentials",
      region: "",
      profile: null,
      message: "AWS credentials were not found for the configured profile."
    };
  }

  if (
    haystack.includes("accessdenied") ||
    haystack.includes("access denied") ||
    haystack.includes("not authorized") ||
    haystack.includes("unauthorizedoperation") ||
    haystack.includes("identity-based policy")
  ) {
    const action = deniedAction(message);

    return {
      ok: false,
      reason: "access_denied",
      region: "",
      profile: null,
      message: action
        ? `AWS credentials are valid, but this role is not authorized to call ${action}.`
        : "AWS credentials are valid, but this role is not authorized for the requested AWS action."
    };
  }

  return {
    ok: false,
    reason: "unknown",
    region: "",
    profile: null,
    message: message ? `AWS request failed: ${message}` : "AWS request could not be checked."
  };
}
