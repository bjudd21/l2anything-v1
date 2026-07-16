import type { CSSProperties, ReactNode } from "react";
import { Badge as ShadBadge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AlertCircleIcon, CheckIcon, ChevronRightIcon, PlayIcon, ZapIcon } from "./icons.js";

export { Button } from "@/components/ui/button";
export { Bubble, BubbleContent } from "@/components/ui/bubble";
export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
export { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
export { Input } from "@/components/ui/input";
export { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
export {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageGroup,
  MessageHeader
} from "@/components/ui/message";
export { Select } from "@/components/ui/select";
export { Textarea } from "@/components/ui/textarea";

export const focusRing =
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/35";

export const button = {
  primary: buttonVariants({ variant: "default" }),
  secondary: buttonVariants({ variant: "secondary" }),
  ghost: buttonVariants({ variant: "ghost" })
};

export const field = `min-h-10 w-full min-w-0 rounded-md border border-border bg-card/45 px-3 text-[13px] text-foreground shadow-sm backdrop-blur-xl transition-colors outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;

export const card = "glass-panel rounded-lg border border-border text-card-foreground";

export const microLabel = "text-[10px] font-semibold uppercase text-muted-foreground";

export function clamp01(value: number) {
  if (Number.isNaN(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

export function ProgressRing({
  fraction,
  label,
  size = 72,
  stroke = 7
}: {
  fraction: number;
  label?: ReactNode;
  size?: number;
  stroke?: number;
}) {
  const value = clamp01(fraction);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div
      className="relative inline-grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
    >
      <svg aria-hidden="true" className="-rotate-90" height={size} width={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          stroke="var(--muted)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          stroke="var(--primary)"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - value)}
          strokeLinecap="round"
          strokeWidth={stroke}
          style={{ transition: "stroke-dashoffset 200ms cubic-bezier(0.23, 1, 0.32, 1)" }}
        />
      </svg>
      <span className="tnum absolute text-sm font-bold text-foreground">
        {label ?? `${Math.round(value * 100)}%`}
      </span>
    </div>
  );
}

export function ProgressBar({
  fraction,
  onSidebar = false
}: {
  fraction: number;
  onSidebar?: boolean;
}) {
  const value = clamp01(fraction);

  return (
    <div
      aria-hidden="true"
      className={`h-1 w-full overflow-hidden rounded-full ${onSidebar ? "bg-sidebar-accent/70" : "bg-muted/70"}`}
    >
      <div
        className="h-full rounded-full bg-primary"
        style={{ width: `${Math.round(value * 100)}%` }}
      />
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="tnum text-xl font-bold text-foreground">{value}</div>
      <div className="mt-0.5 truncate text-xs font-medium text-muted-foreground">{label}</div>
    </div>
  );
}

export function Badge({
  children,
  className,
  tone = "neutral"
}: {
  children: ReactNode;
  className?: string;
  tone?: "neutral" | "accent" | "success" | "warning" | "danger";
}) {
  const variant = {
    neutral: "default",
    accent: "accent",
    success: "success",
    warning: "warning",
    danger: "destructive"
  } as const;

  return (
    <ShadBadge className={cn(className)} variant={variant[tone]}>
      {children}
    </ShadBadge>
  );
}

export type StatusPillStatus = "in-progress" | "up-next" | "complete" | "due";
export type StatusTone = "neutral" | "accent" | "warning" | "success" | "danger";

const statusPillTone: Record<StatusPillStatus, StatusTone> = {
  complete: "success",
  due: "danger",
  "in-progress": "warning",
  "up-next": "neutral"
};

const statusPillLabel: Record<StatusPillStatus, string> = {
  complete: "Complete",
  due: "Due",
  "in-progress": "In progress",
  "up-next": "Up next"
};

/** Status pill pattern from docs/design-system.md §6. */
export function StatusPill({
  className,
  count,
  label,
  status
}: {
  className?: string;
  count?: number;
  label?: string;
  status: StatusPillStatus;
}) {
  const text = label ?? (status === "due" && count ? `${count} due` : statusPillLabel[status]);

  return (
    <Badge className={cn("rounded-full normal-case", className)} tone={statusPillTone[status]}>
      {status === "complete" ? <CheckIcon size={12} /> : null}
      {text}
    </Badge>
  );
}

export type LessonStatusValue = "unread" | "in_progress" | "completed";

/** Lesson status pill backed by the shared status system. */
export function LessonStatusPill({
  className,
  status
}: {
  className?: string;
  status: LessonStatusValue;
}) {
  if (status === "completed") {
    return <StatusPill className={className} status="complete" />;
  }

  if (status === "in_progress") {
    return <StatusPill className={className} status="in-progress" />;
  }

  return <StatusPill className={className} label="Unread" status="up-next" />;
}

/** Labeled review-due badge from docs/design-system.md §6. */
export function DueBadge({
  className,
  count,
  compact = false,
  noun = "review"
}: {
  className?: string;
  compact?: boolean;
  count: number;
  noun?: string;
}) {
  if (count <= 0) {
    return null;
  }

  const plural = count === 1 ? noun : `${noun}s`;

  return (
    <Badge className={cn("rounded-full normal-case", className)} tone="danger">
      <ZapIcon size={12} />
      {compact ? `${count} due` : `${count} ${plural} due`}
    </Badge>
  );
}

/** Section header pattern from docs/design-system.md §7. */
export function SectionHeader({
  actions,
  as = "h2",
  className,
  count,
  icon,
  meta,
  title,
  tone = "accent"
}: {
  actions?: ReactNode;
  as?: "h1" | "h2" | "h3";
  className?: string;
  count?: ReactNode;
  icon?: ReactNode;
  meta?: ReactNode;
  title: ReactNode;
  tone?: "accent" | "neutral";
}) {
  const TitleTag = as;

  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      {icon ? (
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-md border shadow-sm",
            tone === "accent"
              ? "border-primary/25 bg-primary-soft/65 text-primary"
              : "border-border bg-secondary/55 text-muted-foreground"
          )}
        >
          {icon}
        </span>
      ) : null}
      <TitleTag
        className={cn(
          "min-w-0 truncate font-bold leading-tight text-foreground",
          as === "h1" ? "text-[22px]" : as === "h2" ? "text-base" : "text-[15.5px]"
        )}
      >
        {title}
      </TitleTag>
      {count !== undefined ? (
        <span className="tnum shrink-0 rounded-full border border-border bg-secondary/55 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
          {count}
        </span>
      ) : null}
      <span
        aria-hidden="true"
        className="hidden h-px min-w-8 flex-1 bg-gradient-to-r from-border to-transparent sm:block"
      />
      {meta ? <span className="shrink-0 text-[13px] text-muted-foreground">{meta}</span> : null}
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}

export type StrengthLevel = "new" | "learning" | "strong";

const strengthConfig: Record<StrengthLevel, { filled: number; label: string; toneClass: string }> =
  {
    learning: { filled: 2, label: "Learning", toneClass: "text-warning bg-warning" },
    new: { filled: 1, label: "New", toneClass: "danger-readable bg-danger" },
    strong: { filled: 3, label: "Strong", toneClass: "text-success bg-success" }
  };

/** Strength meter pattern from docs/design-system.md §6. */
export function StrengthMeter({ className, level }: { className?: string; level: StrengthLevel }) {
  const config = strengthConfig[level];
  const [textClass, dotClass] = config.toneClass.split(" ");

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="inline-flex items-center gap-1" aria-hidden="true">
        {[0, 1, 2].map((dot) => (
          <span
            className={cn("size-1.5 rounded-full", dot < config.filled ? dotClass : "bg-muted")}
            key={dot}
          />
        ))}
      </span>
      <span className={cn("text-xs font-semibold", textClass)}>{config.label}</span>
    </span>
  );
}

export const statusCardClass: Record<StatusTone, string> = {
  accent: "border-primary/35 tint-accent",
  danger: "border-danger/35 tint-danger",
  neutral: "border-border",
  success: "border-success/30 tint-success",
  warning: "border-warning/35 tint-warning"
};

/** Status-tinted card pattern from docs/design-system.md §7. */
export function StatusCard({
  children,
  className,
  style,
  tone = "neutral"
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  tone?: StatusTone;
}) {
  return (
    <section className={cn(card, statusCardClass[tone], className)} style={style}>
      {children}
    </section>
  );
}

const gradientCtaClass: Record<StatusTone, string> = {
  accent:
    "border-primary/45 bg-gradient-to-b from-primary/22 to-primary/4 text-foreground hover:border-primary/65 hover:from-primary/32",
  danger:
    "border-danger/45 bg-gradient-to-b from-danger/22 to-danger/4 text-foreground hover:border-danger/65 hover:from-danger/32",
  neutral:
    "border-border bg-gradient-to-b from-secondary/70 to-transparent text-foreground hover:border-muted-foreground/45 hover:from-secondary/85",
  success:
    "border-success/40 bg-gradient-to-b from-success/20 to-success/4 text-foreground hover:border-success/60 hover:from-success/30",
  warning:
    "border-warning/45 bg-gradient-to-b from-warning/22 to-warning/4 text-foreground hover:border-warning/65 hover:from-warning/32"
};

const gradientCtaIconClass: Record<StatusTone, string> = {
  accent: "border-primary/40 bg-primary/20 text-primary",
  danger: "border-danger/40 bg-danger/20 text-danger",
  neutral: "border-border bg-secondary/70 text-muted-foreground",
  success: "border-success/40 bg-success/20 text-success",
  warning: "border-warning/40 bg-warning/20 text-warning"
};

/** Secondary gradient CTA pattern from docs/design-system.md §7. */
export function GradientCardCta({
  children,
  className,
  detail,
  disabled = false,
  href,
  icon,
  onClick,
  tone = "neutral",
  type = "button"
}: {
  children: ReactNode;
  className?: string;
  detail?: ReactNode;
  disabled?: boolean;
  href?: string;
  icon?: ReactNode;
  onClick?: () => void;
  tone?: StatusTone;
  type?: "button" | "submit" | "reset";
}) {
  const content = (
    <>
      <span
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-md border",
          gradientCtaIconClass[tone]
        )}
      >
        {icon ?? <PlayIcon size={13} />}
      </span>
      <span className="min-w-0 truncate">{children}</span>
      {detail ? (
        <>
          <span aria-hidden="true" className="text-muted-foreground/70">
            ·
          </span>
          <span className="min-w-0 truncate font-normal text-muted-foreground">{detail}</span>
        </>
      ) : null}
      <ChevronRightIcon
        className="ml-auto shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-foreground"
        size={15}
      />
    </>
  );
  const classes = cn(
    "group inline-flex min-h-11 w-full min-w-0 items-center gap-2 rounded-md border px-3 text-sm font-semibold shadow-sm transition-colors duration-150 active:translate-y-px focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/35 disabled:pointer-events-none disabled:opacity-50",
    gradientCtaClass[tone],
    className
  );

  if (href && !disabled) {
    return (
      <a className={classes} href={href}>
        {content}
      </a>
    );
  }

  return (
    <button className={classes} disabled={disabled} onClick={onClick} type={type}>
      {content}
    </button>
  );
}

/** The actual lesson workflow: learn, check understanding, then complete. */
export type LessonStage = "learn" | "check" | "complete";

export function LessonStepper({
  className,
  current = "learn"
}: {
  className?: string;
  current?: LessonStage;
}) {
  const steps: Array<{ id: LessonStage; label: string }> = [
    { id: "learn", label: "Learn" },
    { id: "check", label: "Check understanding" },
    { id: "complete", label: "Complete" }
  ];
  const currentIndex = steps.findIndex((step) => step.id === current);

  return (
    <ol className={cn("flex min-w-0 flex-wrap items-center gap-3", className)}>
      {steps.map((step, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;

        return (
          <li className="flex min-w-0 items-center gap-3" key={step.id}>
            {index > 0 ? (
              <span aria-hidden="true" className="text-muted-foreground/55">
                <ChevronRightIcon size={13} />
              </span>
            ) : null}
            <span
              className={cn(
                "inline-flex min-h-8 items-center gap-2 text-sm",
                done
                  ? "text-muted-foreground"
                  : active
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground"
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "grid size-6 place-items-center rounded-full border text-[11px] font-bold",
                  done
                    ? "border-success bg-success text-primary-foreground"
                    : active
                      ? "border-primary text-primary ring-4 ring-primary/15"
                      : "border-border bg-secondary/35 text-muted-foreground"
                )}
              >
                {done ? <CheckIcon size={10} /> : index + 1}
              </span>
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function ShellSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "grid gap-2" : "grid gap-3"}>
      <div className="h-3 w-3/4 rounded-sm bg-muted/70" />
      <div className="h-3 w-1/2 rounded-sm bg-muted/70" />
      <div className="h-3 w-2/3 rounded-sm bg-muted/70" />
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div aria-busy="true" className="mx-auto grid w-full max-w-6xl gap-6" role="status">
      <ShellSkeleton />
    </div>
  );
}

export function InlineNotice({
  body,
  title,
  tone = "neutral"
}: {
  body: ReactNode;
  title: string;
  tone?: "neutral" | "error" | "warning";
}) {
  const toneClass =
    tone === "error"
      ? "border-danger/35 bg-danger-soft/65"
      : tone === "warning"
        ? "border-warning/35 bg-warning-soft/65"
        : "border-border bg-secondary/55";
  const iconClass =
    tone === "error"
      ? "text-danger"
      : tone === "warning"
        ? "text-warning"
        : "text-muted-foreground";

  return (
    <section className={`flex gap-3 rounded-lg border px-4 py-3 backdrop-blur-xl ${toneClass}`}>
      <AlertCircleIcon className={`mt-0.5 shrink-0 ${iconClass}`} size={18} />
      <div className="min-w-0">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <p className="mt-0.5 break-words text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">
          {body}
        </p>
      </div>
    </section>
  );
}

export function ReadOnlyField({
  className,
  label,
  value,
  valueClassName
}: {
  className?: string;
  label: string;
  value: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className={cn("grid min-w-0 gap-1 text-sm", className)}>
      <span className="font-medium text-foreground">{label}</span>
      <span
        aria-readonly="true"
        className={cn(
          "min-h-10 min-w-0 w-full break-words rounded-md border border-border bg-card/45 px-3 py-2.5 text-muted-foreground shadow-sm backdrop-blur-xl [overflow-wrap:anywhere]",
          valueClassName
        )}
      >
        {value}
      </span>
    </div>
  );
}
