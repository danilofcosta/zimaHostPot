import type { Metadata } from "next";

import { KnownDevicesPage } from "@/components/pages/known-devices";

export const metadata: Metadata = {
  title: "Dispositivos conhecidos — Zima Hotspot",
};

export default function KnownDevicesRoute() {
  return <KnownDevicesPage />;
}
