import * as React from "react";

import { cn } from "@/lib/utils";

function Marker({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="marker"
      className={cn(
        "mx-auto flex min-h-8 w-fit max-w-full items-center gap-2 rounded-md border border-border bg-card/55 px-2.5 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur-xl",
        className
      )}
      {...props}
    />
  );
}

function MarkerIcon({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="marker-icon"
      className={cn("inline-flex size-5 shrink-0 items-center justify-center text-primary", className)}
      {...props}
    />
  );
}

function MarkerContent({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="marker-content"
      className={cn("min-w-0 truncate font-medium", className)}
      {...props}
    />
  );
}

export { Marker, MarkerContent, MarkerIcon };
