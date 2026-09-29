import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, featured, ...props }: HTMLAttributes<HTMLDivElement> & { featured?: boolean }) {
  return <div className={cn(featured ? "card-featured" : "card", className)} {...props} />;
}

export function CardHeader({ title, subtitle, action, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-4 flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h3 className="text-sm font-medium text-fg">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({ label, value, unit, hint, featured, children }: { label: string; value: ReactNode; unit?: string; hint?: ReactNode; featured?: boolean; children?: ReactNode }) {
  return (
    <Card featured={featured} className="p-5">
      <div className="text-[13px] font-medium">{label}</div>
      {hint && <div className="text-[11.5px] text-muted">{hint}</div>}
      <div className="my-3 text-[32px] font-medium leading-none tracking-tight">
        {value}
        {unit && <span className="ml-1 text-sm font-normal text-muted">{unit}</span>}
      </div>
      {children && <div className="space-y-1.5 border-t border-line/15 pt-3 text-xs text-muted">{children}</div>}
    </Card>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      {icon && <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl border border-line/20 bg-elevated text-muted">{icon}</div>}
      <h3 className="text-[15px] font-medium">{title}</h3>
      {body && <p className="mt-1.5 max-w-md text-[13px] text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-2">{eyebrow}</div>}
        <h1 className="text-[22px] font-medium tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[13px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-line/10", className)} />;
}
