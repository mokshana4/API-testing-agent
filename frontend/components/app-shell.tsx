"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { FileText, FolderKanban, LayoutDashboard, Menu, Play, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProjects, useRuns } from "@/lib/store";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme";
import { BackendStatusPill, useBackendStatus } from "./backend-status";
import { ButtonLink } from "./ui/button";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/run", label: "New run", icon: Play },
  { href: "/reports", label: "Reports", icon: FileText },
];

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { projects } = useProjects();
  const { runs } = useRuns();
  const { status } = useBackendStatus();
  const counts: Record<string, number> = { "/projects": projects.length, "/reports": runs.length };
  const active = (href: string) => {
    if (href === "/") return pathname === "/";
    if (href === "/reports" && pathname.startsWith("/runs/")) return true;
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <div className="flex h-full flex-col gap-1 px-3 py-4">
      <Link href="/" onClick={onNavigate} className="mb-5 flex items-center gap-2.5 px-2.5 text-[14px] font-medium">
        <Logo /> API Testing Agent
      </Link>
      <div className="px-2.5 pb-1.5 text-[11px] text-dim">Workspace</div>
      {NAV.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} onClick={onNavigate}
          className={cn("flex items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] transition",
            active(href) ? "bg-fg/[.07] text-fg" : "text-muted hover:bg-fg/[.04] hover:text-fg")}>
          <Icon size={16} className={active(href) ? "text-brand-sky" : ""} />
          {label}
          {counts[href] ? <span className="ml-auto text-[11px] text-dim">{counts[href]}</span> : null}
        </Link>
      ))}
      {projects.length > 0 && (
        <>
          <div className="mt-5 px-2.5 pb-1.5 text-[11px] text-dim">Projects</div>
          {projects.slice(0, 5).map((p) => (
            <Link key={p.id} href={`/run?project=${p.id}`} onClick={onNavigate} className="truncate rounded-lg px-2.5 py-1.5 text-[12.5px] text-muted hover:bg-fg/[.04] hover:text-fg">
              {p.name}
            </Link>
          ))}
        </>
      )}
      <div className="mt-auto space-y-3 border-t border-line/15 px-2.5 pt-4">
        <div className="text-[11.5px] text-muted">
          Engine
          <div className="mt-0.5 flex items-center gap-2 text-[12.5px] text-fg">
            <span className={cn("h-1.5 w-1.5 rounded-full", status === "online" ? "bg-pass" : status === "offline" ? "bg-err" : "bg-warn")} />
            FastAPI · /backend
          </div>
        </div>
        <ThemeToggle />
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-line/15 bg-panel/70 backdrop-blur lg:block">
        <Sidebar />
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="relative h-full w-64 animate-slide-in border-r border-line/15 bg-panel">
            <button onClick={() => setOpen(false)} className="absolute right-3 top-4 text-muted" aria-label="Close menu"><X size={18} /></button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line/15 bg-bg/70 px-4 backdrop-blur-md sm:px-6">
          <button onClick={() => setOpen(true)} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:text-fg lg:hidden" aria-label="Open menu">
            <Menu size={18} />
          </button>
          <Link href="/" className="flex items-center gap-2 text-[13px] font-medium lg:hidden"><Logo size={18} /> ATA</Link>
          <div className="ml-auto flex items-center gap-2">
            <BackendStatusPill />
            <div className="lg:hidden"><ThemeToggle compact /></div>
            <ButtonLink href="/run" variant="primary" size="sm"><Play size={13} /> New run</ButtonLink>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
