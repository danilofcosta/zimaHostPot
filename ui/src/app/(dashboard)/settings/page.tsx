import type { Metadata } from "next";

import { SettingsPage } from "@/components/pages/settings";
import { requirePasswordChanged } from "@/lib/server/session";

export const metadata: Metadata = {
  title: "Configurações — Zima Hotspot",
};

export default async function SettingsRoute() {
  const session = await requirePasswordChanged();
  const createdAt = session.user.createdAt;

  return (
    <SettingsPage
      user={{
        name: session.user.name,
        username: session.user.username ?? session.user.name,
        email: session.user.email,
        createdAt:
          createdAt instanceof Date
            ? createdAt.toISOString()
            : String(createdAt),
        mustChangePassword: Boolean(session.user.mustChangePassword),
      }}
    />
  );
}
