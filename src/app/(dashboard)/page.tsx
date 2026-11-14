import type { Metadata } from "next";

import { DashboardOverview } from "@/components/pages/dashboard-overview";

export const metadata: Metadata = {
  title: "Dashboard — Zima Hotspot",
};

export default function DashboardPage() {
  return <DashboardOverview />;
}
