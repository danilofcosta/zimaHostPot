import type { Metadata } from "next";

import { DiagnosticsPage } from "@/components/pages/diagnostics";

export const metadata: Metadata = {
  title: "Diagnóstico — Zima Hotspot",
};

export default function DiagnosticsRoute() {
  return <DiagnosticsPage />;
}
