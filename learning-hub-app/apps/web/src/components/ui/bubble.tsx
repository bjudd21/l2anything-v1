import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const bubbleVariants = cva(
  "rounded-lg border px-3.5 py-2.5 text-[13px] leading-6 shadow-sm [overflow-wrap:anywhere]",
  {
    variants: {
      variant: {
        assistant:
          "border-border bg-card/70 text-foreground backdrop-blur-xl",
        user:
          "border-primary/35 bg-primary/90 text-primary-foreground shadow-primary/15",
        ghost:
          "border-transparent bg-transparent p-0 shadow-none"
      }
    },
    defaultVariants: {
      variant: "assistant"
    }
  }
);

function Bubble({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof bubbleVariants>) {
  return <div data-slot="bubble" className={cn(bubbleVariants({ variant }), className)} {...props} />;
}

function BubbleContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="bubble-content" className={cn("min-w-0", className)} {...props} />;
}

export { Bubble, BubbleContent, bubbleVariants };
