import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "tnum inline-flex shrink-0 items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[10px] font-bold uppercase",
  {
    variants: {
      variant: {
        default: "border-border bg-muted/80 text-foreground/80",
        secondary: "border-border bg-card/60 text-foreground",
        accent: "border-primary/25 bg-primary-soft/65 text-primary-strong",
        success: "border-success/25 bg-success-soft/65 text-success",
        warning: "border-warning/25 bg-warning-soft/65 text-warning",
        destructive: "border-danger/25 bg-danger-soft/65 danger-readable",
        outline: "border-border text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
