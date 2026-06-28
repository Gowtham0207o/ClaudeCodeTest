"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  Menu,
  X,
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

function NavContent({ pathname, onClose }: { pathname: string; onClose?: () => void }) {
  return (
    <>
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-[var(--color-border)] lg:border-b">
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
              onClick={onClose}
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
    </>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-[var(--color-border)] lg:bg-[var(--color-surface)]/70 lg:backdrop-blur-xl">
        <NavContent pathname={pathname} />
      </aside>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]/70 backdrop-blur-xl">
        <div className="flex items-center gap-2.5">
          <div className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-violet)] glow-accent">
            <Rocket className="size-4 text-white" />
          </div>
          <p className="text-sm font-semibold">JobSync</p>
        </div>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="rounded-lg p-2 hover:bg-white/[0.05] transition-colors"
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {/* Mobile Sidebar */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="lg:hidden fixed inset-0 z-20 bg-black/40"
            />
            <motion.aside
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="lg:hidden fixed inset-y-0 left-0 z-30 w-64 flex flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur-xl"
            >
              <NavContent pathname={pathname} onClose={() => setMobileOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
