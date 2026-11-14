import type { ReactNode } from "react";

import { ToastProvider } from "@/components/ui/toast";
import { AppShell } from "@/components/layout/app-shell";
import { requirePasswordChanged } from "@/lib/server/session";

export const instant = false;

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await requirePasswordChanged();

  return (
    <ToastProvider>
      <AppShell
        user={{
          name: session.user.name,
          username: session.user.username ?? session.user.name,
        }}
      >
        {children}
      </AppShell>
    </ToastProvider>
  );
}
