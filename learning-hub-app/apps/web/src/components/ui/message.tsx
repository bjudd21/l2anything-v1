import * as React from "react";

import { cn } from "@/lib/utils";

function Message({
  align = "start",
  className,
  ...props
}: React.ComponentProps<"article"> & { align?: "start" | "end" }) {
  return (
    <article
      data-align={align}
      data-slot="message"
      className={cn(
        "group/message flex w-full min-w-0 items-end gap-2",
        align === "end" ? "justify-end" : "justify-start",
        className
      )}
      {...props}
    />
  );
}

function MessageGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="message-group" className={cn("grid gap-1.5", className)} {...props} />;
}

function MessageAvatar({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="message-avatar"
      className={cn(
        "mb-1 grid size-8 shrink-0 place-items-center rounded-md border border-border bg-secondary/70 text-[11px] font-bold text-muted-foreground shadow-sm",
        className
      )}
      {...props}
    />
  );
}

function MessageContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="message-content"
      className={cn("grid min-w-0 max-w-[min(36rem,88%)] gap-1.5", className)}
      {...props}
    />
  );
}

function MessageHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="message-header"
      className={cn("flex min-w-0 items-center gap-2 text-[11px] font-semibold text-muted-foreground", className)}
      {...props}
    />
  );
}

function MessageFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="message-footer"
      className={cn(
        "flex min-w-0 items-center gap-2 text-[11px] font-medium text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

export {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageGroup,
  MessageHeader
};
