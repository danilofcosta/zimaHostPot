import { HotspotDashboard } from "@/components/hotspot/hotspot-dashboard";
import { ToastProvider } from "@/components/ui/toast";

export default function Home() {
  return (
    <ToastProvider>
      <HotspotDashboard />
    </ToastProvider>
  );
}
