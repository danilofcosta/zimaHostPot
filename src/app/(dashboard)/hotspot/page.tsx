import type { Metadata } from "next";

import { HotspotDashboard } from "@/components/hotspot/hotspot-dashboard";

export const metadata: Metadata = {
  title: "Hotspot — Zima Hotspot",
};

export default function HotspotPage() {
  return <HotspotDashboard />;
}
