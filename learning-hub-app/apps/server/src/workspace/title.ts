const htmlEntityMap: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " "
};

function decodeBasicEntities(value: string) {
  return value.replace(/&(#\d+|#x[\da-f]+|[a-z]+);/gi, (entity, inner: string) => {
    if (inner.startsWith("#x")) {
      return String.fromCodePoint(Number.parseInt(inner.slice(2), 16));
    }

    if (inner.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(inner.slice(1), 10));
    }

    return htmlEntityMap[inner.toLowerCase()] ?? entity;
  });
}

function stripTags(value: string) {
  return value.replace(/<[^>]*>/g, " ");
}

function compact(value: string) {
  return decodeBasicEntities(stripTags(value)).replace(/\s+/g, " ").trim();
}

export function titleFromSlug(slug: string) {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function parseLessonNumber(fileName: string) {
  const match = /^(\d{4})-/.exec(fileName);
  return match?.[1] ? Number.parseInt(match[1], 10) : null;
}

export function parseLessonTitle(html: string, fallback: string) {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (titleMatch?.[1]) {
    const title = compact(titleMatch[1]);
    if (title) {
      return title;
    }
  }

  const h1Match = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (h1Match?.[1]) {
    const title = compact(h1Match[1]);
    if (title) {
      return title;
    }
  }

  return titleFromSlug(fallback.replace(/^\d{4}-/, "").replace(/\.html$/i, ""));
}

export function parseRecordTitle(markdown: string, fallback: string) {
  const heading = markdown
    .split(/\r?\n/)
    .map((line) => /^#\s+(.+)$/.exec(line.trim())?.[1]?.trim())
    .find((line): line is string => Boolean(line));

  if (heading) {
    return heading;
  }

  return titleFromSlug(fallback.replace(/^\d{4}-/, "").replace(/\.md$/i, ""));
}

export function parseTopicTitle(missionMarkdown: string | null, slug: string) {
  if (!missionMarkdown) {
    return titleFromSlug(slug);
  }

  const missionHeading = /^#\s+Mission:\s+(.+)$/m.exec(missionMarkdown);
  if (missionHeading?.[1]) {
    return missionHeading[1].trim();
  }

  const firstHeading = /^#\s+(.+)$/m.exec(missionMarkdown);
  return firstHeading?.[1]?.trim() ?? titleFromSlug(slug);
}
