"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark" | "system";
const KEY = "ata.theme";
const Ctx = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({ theme: "dark", setTheme: () => {} });

/** Inline script run before paint so there's no light/dark flash. */
export const themeInitScript = `(function(){try{var t=localStorage.getItem('${KEY}')||'dark';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){document.documentElement.classList.add('dark')}})()`;

function apply(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  useEffect(() => {
    const saved = (localStorage.getItem(KEY) as Theme | null) ?? "dark";
    setThemeState(saved);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => (localStorage.getItem(KEY) ?? "dark") === "system" && apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const setTheme = useCallback((t: Theme) => {
    localStorage.setItem(KEY, t);
    setThemeState(t);
    apply(t);
  }, []);
  return <Ctx.Provider value={{ theme, setTheme }}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);

export function ThemeToggle({ compact }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();
  const opts: { v: Theme; icon: ReactNode; label: string }[] = [
    { v: "light", icon: <Sun size={14} />, label: "Light" },
    { v: "dark", icon: <Moon size={14} />, label: "Dark" },
    { v: "system", icon: <Monitor size={14} />, label: "System" },
  ];
  if (compact) {
    const next: Theme = theme === "dark" ? "light" : "dark";
    return (
      <button onClick={() => setTheme(next)} aria-label={`Switch to ${next} mode`} className="grid h-8 w-8 place-items-center rounded-lg border border-line/20 text-muted transition hover:text-fg">
        {theme === "dark" ? <Moon size={15} /> : <Sun size={15} />}
      </button>
    );
  }
  return (
    <div className="inline-flex rounded-lg border border-line/15 p-0.5" role="radiogroup" aria-label="Theme">
      {opts.map((o) => (
        <button key={o.v} role="radio" aria-checked={theme === o.v} aria-label={o.label} title={o.label} onClick={() => setTheme(o.v)}
          className={cn("grid h-7 w-8 place-items-center rounded-md transition", theme === o.v ? "bg-fg/10 text-fg" : "text-dim hover:text-fg")}>
          {o.icon}
        </button>
      ))}
    </div>
  );
}
