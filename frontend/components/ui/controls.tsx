"use client";
import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Segmented<T extends string>({ value, onChange, options, size = "sm", className }: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; count?: number }[];
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div role="radiogroup" className={cn("inline-flex rounded-full border border-line/15 bg-fg/[.03] p-[3px]", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full transition",
            size === "sm" ? "px-3 py-1 text-xs" : "px-4 py-1.5 text-[13px]",
            value === o.value ? "bg-fg text-bg font-medium shadow-sm" : "text-muted hover:text-fg",
          )}
        >
          {o.label}
          {o.count !== undefined && <span className={cn("text-[10.5px]", value === o.value ? "opacity-60" : "text-dim")}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: string; count?: number; icon?: ReactNode }[] }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line/15">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            "relative -mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] transition",
            value === t.value ? "border-brand-sky text-fg" : "border-transparent text-muted hover:text-fg",
          )}
        >
          {t.icon}
          {t.label}
          {t.count !== undefined && <span className="rounded-full bg-line/15 px-1.5 text-[10.5px] text-muted">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label, description, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; id: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <label htmlFor={id} className="cursor-pointer">
        <div className="text-[13px]">{label}</div>
        {description && <div className="text-[11.5px] text-muted">{description}</div>}
      </label>
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn("relative h-[22px] w-10 shrink-0 rounded-full transition", checked ? "bg-brand-grad" : "bg-line/30")}
      >
        <span className={cn("absolute left-[3px] top-[3px] h-4 w-4 rounded-full bg-white shadow transition", checked && "translate-x-[18px]")} />
      </button>
    </div>
  );
}

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="label">{label}</label>
      {children}
      {hint && <p className="mt-1.5 text-[11.5px] text-dim">{hint}</p>}
    </div>
  );
}

/** Right-side sheet; closes on Esc and backdrop click. */
export function Drawer({ open, onClose, title, subtitle, children, width = "max-w-3xl" }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; width?: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className={cn("relative flex h-full w-full animate-slide-in flex-col border-l border-line/15 bg-panel shadow-2xl", width)}>
        <div className="flex items-start justify-between gap-4 border-b border-line/15 px-6 py-4">
          <div className="min-w-0">
            <div className="text-[15px] font-medium">{title}</div>
            {subtitle && <div className="mt-1 text-xs text-muted">{subtitle}</div>}
          </div>
          <button onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-fg/5 hover:text-fg" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
