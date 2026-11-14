import type { Metadata } from "next";

import { SharePage } from "@/components/pages/share";

export const metadata: Metadata = {
  title: "Compartilhar Wi-Fi — Zima Hotspot",
};

export default function ShareRoute() {
  return <SharePage />;
}
