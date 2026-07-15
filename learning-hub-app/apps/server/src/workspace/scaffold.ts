import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { assertInsideRoot } from "./path.js";

export interface TopicScaffoldInput {
  missionContent?: string;
  notesContent?: string;
  slug: string;
  title: string;
}

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateTopicSlug(slug: string) {
  if (!slugPattern.test(slug)) {
    throw new Error("Topic slug must be dash-case lowercase letters and numbers.");
  }

  return slug;
}

function missionStub(title: string) {
  return `# Mission: ${title}

## Why
_To be established by the mission interview._

## Success looks like
- _To be established._

## Constraints
- _To be established._

## Out of scope
- _To be established._
`;
}

function notesStub() {
  return `# Notes

Tutor scratchpad for learning preferences and working notes.
`;
}

function resourcesStub(title: string) {
  return `# ${title} Resources

## Knowledge

## Wisdom (Communities)

## Gaps
- Trusted resources have not been curated yet.
`;
}

export async function scaffoldTopic(rootDir: string, input: TopicScaffoldInput) {
  const slug = validateTopicSlug(input.slug);
  const topicDir = assertInsideRoot(rootDir, slug);

  await mkdir(topicDir, { recursive: true });
  await Promise.all([
    mkdir(join(topicDir, "lessons"), { recursive: true }),
    mkdir(join(topicDir, "learning-records"), { recursive: true }),
    mkdir(join(topicDir, "reference"), { recursive: true })
  ]);

  await Promise.all([
    writeFile(join(topicDir, "MISSION.md"), input.missionContent ?? missionStub(input.title), {
      flag: "wx"
    }),
    writeFile(join(topicDir, "NOTES.md"), input.notesContent ?? notesStub(), { flag: "wx" }),
    writeFile(join(topicDir, "RESOURCES.md"), resourcesStub(input.title), { flag: "wx" })
  ]);

  return {
    slug,
    dirPath: topicDir
  };
}
