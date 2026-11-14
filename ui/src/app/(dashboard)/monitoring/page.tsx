import type { Metadata } from "next";

import { MonitoringPage } from "@/components/pages/monitoring";

export const metadata: Metadata = {
  title: "Monitoramento — Zima Hotspot",
};

export default function MonitoringRoute() {
  return <MonitoringPage />;
}
