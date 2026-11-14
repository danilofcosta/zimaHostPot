import type { Metadata } from "next";

import { ConnectedDevicesPage } from "@/components/pages/connected-devices";

export const metadata: Metadata = {
  title: "Dispositivos conectados — Zima Hotspot",
};

export default function DevicesPage() {
  return <ConnectedDevicesPage />;
}
