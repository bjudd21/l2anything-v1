import { classifyAwsCredentialError, errorMessage, errorName } from "../aws/errors.js";
import type { AgentEvent } from "./types.js";

export function providerErrorEvent(error: unknown): AgentEvent {
  const classified = classifyAwsCredentialError(error);

  if (classified.reason !== "unknown") {
    return {
      type: "error",
      code: "aws_auth",
      reason: classified.reason,
      message: classified.message,
      recoverable: true
    };
  }

  return {
    type: "error",
    code: "provider_error",
    message: errorMessage(error) || "Provider stream failed.",
    recoverable: false
  };
}

export function providerConfigError(message: string): AgentEvent {
  return {
    type: "error",
    code: "provider_config",
    message,
    recoverable: true
  };
}

export function isUnauthorizedError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const status =
    "status" in error && typeof error.status === "number"
      ? error.status
      : "statusCode" in error && typeof error.statusCode === "number"
        ? error.statusCode
        : undefined;
  const haystack = `${errorName(error)} ${errorMessage(error)}`.toLowerCase();

  return status === 401 || haystack.includes("401") || haystack.includes("unauthorized");
}
