"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  Bell,
  Cpu,
  Gauge,
  LayoutDashboard,
  LogOut,
  Menu,
  MonitorSmartphone,
  QrCode,
  Router,
  Settings,
  Stethoscope,
  Users,
  Wifi,
  X,
} from "lucide-react";

import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

interface AppShellProps {
  user: {
    name: string;
    username: string;
  };
  children: ReactNode;
}

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  exact?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Visão geral",
    items: [
      {
        href: "/",
        label: "Dashboard",
        icon: <LayoutDashboard className="h-4 w-4" />,
        exact: true,
      },
      {
        href: "/hotspot",
        label: "Hotspot",
        icon: <Wifi className="h-4 w-4" />,
      },
    ],
  },
  {
    label: "Rede Wi-Fi",
    items: [
      {
        href: "/devices",
        label: "Dispositivos conectados",
        icon: <MonitorSmartphone className="h-4 w-4" />,
        exact: true,
      },
      {
        href: "/devices/known",
        label: "Dispositivos conhecidos",
        icon: <Users className="h-4 w-4" />,
      },
      {
        href: "/monitoring",
        label: "Monitoramento",
        icon: <Activity className="h-4 w-4" />,
      },
      {
        href: "/events",
        label: "Eventos",
        icon: <Bell className="h-4 w-4" />,
      },
      {
        href: "/share",
        label: "Compartilhar Wi-Fi",
        icon: <QrCode className="h-4 w-4" />,
      },
    ],
  },
  {
    label: "Sistema",
    items: [
      {
        href: "/diagnostics",
        label: "Diagnóstico",
        icon: <Stethoscope className="h-4 w-4" />,
      },
      {
        href: "/system",
        label: "Sistema",
        icon: <Cpu className="h-4 w-4" />,
      },
      {
        href: "/settings",
        label: "Configurações",
        icon: <Settings className="h-4 w-4" />,
      },
    ],
  },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) {
    return pathname === item.href;
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function Brand() {
  return (
    <Link
      href="/"
      className="flex items-center gap-3 rounded-xl px-1 py-1 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-300 via-emerald-400 to-teal-500 text-emerald-950 shadow-[0_14px_40px_-14px_rgba(52,211,153,0.8)]">
        <Wifi className="h-5 w-5" strokeWidth={2} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold tracking-tight text-white">
          Zima Hotspot
        </span>
        <span className="block text-[0.66rem] uppercase tracking-[0.18em] text-zinc-500">
          painel de controle
        </span>
      </span>
    </Link>
  );
}

function SidebarContent({
  user,
  onNavigate,
}: {
  user: AppShellProps["user"];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await authClient.signOut();
    } finally {
      router.replace("/login");
      router.refresh();
    }
  };

  const initials = (user.name || user.username || "?")
    .trim()
    .slice(0, 1)
    .toUpperCase();

  return (
    <div className="flex h-full flex-col">
      <div className="px-3 pb-4 pt-4">
        <Brand />
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-1.5 px-2 text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-zinc-600">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(pathname, item);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[0.8rem] font-medium transition-colors",
                        active
                          ? "bg-emerald-400/[0.12] text-emerald-200 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.18)]"
                          : "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-100",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors",
                          active
                            ? "bg-emerald-400/15 text-emerald-300"
                            : "bg-white/[0.03] text-zinc-500 group-hover:text-zinc-300",
                        )}
                      >
                        {item.icon}
                      </span>
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/[0.06] p-3">
        <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] px-2.5 py-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-xs font-semibold text-emerald-300">
            {initials}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium text-zinc-200">
              {user.name}
            </span>
            <span className="block truncate font-mono text-[0.66rem] text-zinc-500">
              {user.username}
            </span>
          </span>
          <button
            type="button"
            onClick={() => {
              void signOut();
            }}
            disabled={signingOut}
            title="Sair"
            aria-label="Sair"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 disabled:opacity-50"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ user, children }: AppShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-white/[0.07] bg-[#070a0e]/95 backdrop-blur lg:block">
        <SidebarContent user={user} />
      </aside>

      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-white/[0.07] bg-[#06080c]/85 px-4 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir menu"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-zinc-300"
        >
          <Menu className="h-4 w-4" />
        </button>
        <span className="flex items-center gap-2 text-sm font-semibold text-white">
          <Router className="h-4 w-4 text-emerald-300" />
          Zima Hotspot
        </span>
      </header>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Fechar menu"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative z-10 h-full w-72 border-r border-white/10 bg-[#070a0e] shadow-2xl">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Fechar menu"
              className="absolute right-3 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-white/[0.06] hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
            <SidebarContent
              user={user}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </div>
      ) : null}

      <main className="relative mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div
          aria-hidden="true"
          className="pointer-events-none fixed right-0 top-0 -z-10 h-72 w-72 rounded-full bg-emerald-500/[0.06] blur-[120px]"
        />
        {children}
        <footer className="mt-10 flex flex-col items-center justify-between gap-1.5 border-t border-white/[0.06] pt-5 text-[0.68rem] text-zinc-600 sm:flex-row">
          <p className="flex items-center gap-1.5">
            <Gauge className="h-3 w-3" />
            Zima Hotspot · dados reais do host, sem simulação
          </p>
          <p className="font-mono">acesso autenticado via BFF</p>
        </footer>
      </main>
    </div>
  );
}
