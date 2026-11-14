import type { Metadata } from "next";

import { EventsPage } from "@/components/pages/events";

export const metadata: Metadata = {
  title: "Eventos — Zima Hotspot",
};

export default function EventsRoute() {
  return <EventsPage />;
}
