"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Workflow,
  Briefcase,
  SendHorizontal,
  FileText,
  Settings,
  Rocket,
  Bot,
  Link2,
  Wand2,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/automation", label: "Automation", icon: Bot },
  { href: "/pipeline", label: "Live Pipeline", icon: Workflow },
  { href: "/jobs", label: "Matched Jobs", icon: Briefcase },
  { href: "/applications", label: "Applications", icon: SendHorizontal },
  { href: "/apply", label: "Apply by Link", icon: Link2 },
  { href: "/tailor", label: "Tailor Résumé", icon: Wand2 },
  { href: "/manual", label: "Manual Applications", icon: ClipboardList },
  { href: "/resume", label: "Resume & Profile", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]/70 backdrop-blur-xl">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-violet)] glow-accent">
          <Rocket className="size-5 text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold leading-none">JobSync</p>
          <p className="mt-1 text-[10px] uppercase tracking-widest text-[var(--color-faint)]">
            Autonomous Apply
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                active
                  ? "text-white"
                  : "text-[var(--color-muted)] hover:text-white hover:bg-white/[0.03]",
              )}
            >
              {active && (
                <motion.span
                  layoutId="nav-active"
                  className="absolute inset-0 rounded-xl bg-gradient-to-r from-[var(--color-accent)]/20 to-[var(--color-violet)]/10 ring-1 ring-[var(--color-accent)]/30"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <Icon className={cn("relative size-[18px]", active && "text-[var(--color-accent-bright)]")} />
              <span className="relative font-medium">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="m-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
        <p className="text-xs font-medium text-[var(--color-text)]">Pipeline status</p>
        <div className="mt-2 flex items-center gap-2">
          <span className="size-2 rounded-full bg-[var(--color-emerald)] animate-pulse-ring" />
          <span className="text-xs text-[var(--color-muted)]">Engine online</span>
        </div>
      </div>
    </aside>
  );
}
