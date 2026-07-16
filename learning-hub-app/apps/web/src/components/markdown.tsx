import type { ReactNode } from "react";

function safeHref(value: string) {
  if (/^(https?:|mailto:)/i.test(value)) {
    return value;
  }

  return "#";
}

function renderLinks(text: string, keyPrefix: string) {
  const nodes: ReactNode[] = [];
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(text))) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    nodes.push(
      <a
        className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        href={safeHref(match[2] ?? "")}
        key={`${keyPrefix}-${match.index}`}
        rel="noreferrer"
        target="_blank"
      >
        {match[1]}
      </a>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function inlineMarkdown(text: string) {
  const nodes: ReactNode[] = [];

  text.split(/(`[^`]+`)/g).forEach((segment, index) => {
    if (segment.length > 2 && segment.startsWith("`") && segment.endsWith("`")) {
      nodes.push(
        <code
          className="rounded-[0.35rem] border border-border bg-secondary/50 px-1.5 py-0.5 font-mono text-[0.86em] text-foreground"
          key={`code-${index}`}
        >
          {segment.slice(1, -1)}
        </code>
      );
      return;
    }

    nodes.push(...renderLinks(segment, `seg-${index}`));
  });

  return nodes;
}

export function MarkdownView({
  content,
  empty,
  omitFirstHeading = false
}: {
  content?: string | null;
  empty: string;
  omitFirstHeading?: boolean;
}) {
  if (!content?.trim()) {
    return <p className="text-sm leading-6 text-muted-foreground">{empty}</p>;
  }

  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let listItems: string[] = [];
  let codeLines: string[] = [];
  let codeLang = "";
  let inCode = false;
  let firstHeadingOmitted = false;

  function flushList() {
    if (!listItems.length) {
      return;
    }

    const current = listItems;
    listItems = [];
    blocks.push(
      <ul className="my-3 grid list-disc gap-1 pl-5 text-sm leading-6" key={`list-${blocks.length}`}>
        {current.map((item, index) => (
          <li key={`${index}-${item}`}>{inlineMarkdown(item)}</li>
        ))}
      </ul>
    );
  }

  function flushCode() {
    if (!codeLines.length) {
      codeLang = "";
      return;
    }

    const current = codeLines;
    const lang = codeLang;
    codeLines = [];
    codeLang = "";
    blocks.push(
      <pre
        className="my-3 overflow-x-auto rounded-lg border border-border bg-background/60 p-3.5"
        key={`code-${blocks.length}`}
      >
        <code
          className={`font-mono text-[12.5px] leading-6 text-foreground${lang ? ` language-${lang}` : ""}`}
        >
          {current.join("\n")}
        </code>
      </pre>
    );
  }

  lines.forEach((line, index) => {
    const fence = /^\s*```(\w*)\s*$/.exec(line);

    if (fence) {
      if (inCode) {
        inCode = false;
        flushCode();
      } else {
        flushList();
        inCode = true;
        codeLang = fence[1] ?? "";
      }
      return;
    }

    if (inCode) {
      codeLines.push(line);
      return;
    }

    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      return;
    }

    if (trimmed.startsWith("- ")) {
      listItems.push(trimmed.slice(2));
      return;
    }

    flushList();

    if (trimmed.startsWith("### ")) {
      blocks.push(
        <h4 className="mt-4 text-base font-semibold" key={index}>
          {inlineMarkdown(trimmed.slice(4))}
        </h4>
      );
      return;
    }

    if (trimmed.startsWith("## ")) {
      blocks.push(
        <h3 className="mt-5 text-lg font-semibold" key={index}>
          {inlineMarkdown(trimmed.slice(3))}
        </h3>
      );
      return;
    }

    if (trimmed.startsWith("# ")) {
      if (omitFirstHeading && !firstHeadingOmitted) {
        firstHeadingOmitted = true;
        return;
      }

      blocks.push(
        <h2 className="text-lg font-bold" key={index}>
          {inlineMarkdown(trimmed.slice(2))}
        </h2>
      );
      return;
    }

    blocks.push(
      <p className="my-3 text-sm leading-6 text-muted-foreground" key={index}>
        {inlineMarkdown(trimmed)}
      </p>
    );
  });

  if (inCode) {
    inCode = false;
    flushCode();
  }

  flushList();

  return <div className="min-w-0 max-w-[75ch] [overflow-wrap:anywhere]">{blocks}</div>;
}
