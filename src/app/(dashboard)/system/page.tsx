import type { Metadata } from "next";

import { SystemPage } from "@/components/pages/system";

export const metadata: Metadata = {
  title: "Sistema — Zima Hotspot",
};

export default function SystemRoute() {
  return <SystemPage />;
}
