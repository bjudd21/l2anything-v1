import { readdirSync } from "node:fs";

export function formatWorkspaceNumber(number: number) {
  return number.toString().padStart(4, "0");
}

export function getNextWorkspaceNumber(directory: string) {
  const maxExisting = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => /^(\d{4})-/.exec(entry.name)?.[1])
    .filter((value): value is string => Boolean(value))
    .map((value) => Number.parseInt(value, 10))
    .reduce((max, current) => Math.max(max, current), 0);

  const next = maxExisting + 1;

  return {
    number: next,
    padded: formatWorkspaceNumber(next)
  };
}
