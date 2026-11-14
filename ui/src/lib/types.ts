export type Band = "bg" | "a";

export type HealthStatus = "ok" | "degraded";

export interface HealthResponse {
  status: HealthStatus;
  service: string;
  version: string;
  environment: string;
  nmcli_available: boolean;
  nmcli_version: string | null;
  timestamp: string;
}

export interface HotspotNetwork {
  ssid: string;
  password: string;
  security: string;
  mode: string;
  band: string | null;
  channel: string | number;
  qr_code_string: string;
}

export interface InterfaceSummary {
  name: string;
  state: string;
  mac_address: string;
}

export interface InterfaceDetails extends InterfaceSummary {
  ipv4_address: string;
  ipv4_cidr: string;
  gateway: string;
  dhcp_range: string;
}

export interface HotspotStatus {
  active: boolean;
  status_text: string;
  interface: string;
  connection_name: string | null;
  connection_uuid: string | null;
  device_state: string;
  ip_address: string | null;
}

export interface HotspotCreateInput {
  name: string;
  password: string;
  interface: string;
  profile_name: string;
  band: Band;
  channel: number | null;
  use_sudo: boolean;
}

export interface HotspotConfigInput {
  name: string;
  password: string;
  interface: string;
  profile_name: string;
  band: Band;
  channel: number | null;
  use_sudo: boolean;
}

export interface HotspotConfig {
  name: string;
  password: string;
  password_set: boolean;
  interface: string;
  profile_name: string;
  band: Band;
  channel: number | null;
  use_sudo: boolean;
  updated_at: string | null;
  is_default: boolean;
}

export interface HotspotStartInput {
  name: string;
  password: string;
  interface: string;
  profile_name: string;
  use_sudo: boolean;
}

export interface HotspotStopInput {
  interface: string;
  profile_name: string;
  use_sudo: boolean;
}

export interface HotspotCreateResult {
  status: string;
  message: string;
  return_code: number;
  connection_uuid: string | null;
  profile_name: string;
  created_at: string;
  network: HotspotNetwork;
  interface_details: InterfaceDetails;
  raw_output: string;
}

export interface HotspotStartResult {
  status: string;
  message: string;
  ssid: string;
  interface: string;
  activated_at: string;
  raw_output: string;
}

export interface HotspotStopResult {
  status: string;
  message: string;
  stopped_at: string;
  raw_output: string;
}

export interface HotspotTeardownResult {
  status: string;
  message: string;
  was_active: boolean;
  previous_uuid: string | null;
  profile_name: string;
  profile_deleted: boolean;
  stopped_at: string;
  interface_details: InterfaceSummary;
  raw_output: string;
}

export interface HotspotClient {
  ip_address: string;
  mac_address: string | null;
  hostname: string | null;
  state: string;
  is_active: boolean;
  first_seen: string | null;
  last_seen: string | null;
  lease_expires_at: string | null;
}

export interface HotspotClientsResponse {
  interface: string;
  count: number;
  active_count: number;
  clients: HotspotClient[];
  checked_at: string;
}

export type ScanMode = "fresh" | "cached";

export interface ChannelUsage {
  channel: number;
  band: Band;
  networks: number;
  strongest_signal: number | null;
  interference: number;
  recommended: boolean;
}

export interface ChannelRecommendation {
  band: Band;
  channel: number | null;
  networks: number;
  strongest_signal: number | null;
  interference: number | null;
  reason: string;
}

export interface WifiChannelAnalysis {
  interface: string | null;
  scan_mode: ScanMode;
  scanned_at: string;
  networks: number;
  channels: ChannelUsage[];
  recommendations: ChannelRecommendation[];
}

export interface ApiErrorPayload {
  code?: string;
  message?: string;
  details?: unknown;
  request_id?: string;
}

export interface ApiErrorEnvelope {
  error?: ApiErrorPayload;
}

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------

export type DeviceState =
  | "associated"
  | "active"
  | "dhcp_only"
  | "inactive"
  | "disconnected";

export type DeviceType =
  | "unknown"
  | "phone"
  | "tablet"
  | "computer"
  | "tv"
  | "iot"
  | "network"
  | "printer"
  | "other";

export interface DeviceFlags {
  nickname?: string | null;
  device_type?: DeviceType;
  is_known?: boolean | number;
  internet_blocked?: boolean | number;
  banned?: boolean | number;
  notes?: string | null;
}

export interface WifiStationInfo {
  mac: string;
  interface: string;
  signal_dbm?: number | null;
  connected_seconds?: number;
  inactive_ms?: number;
  rx_bytes?: number;
  tx_bytes?: number;
  rx_packets?: number;
  tx_packets?: number;
}

export interface NeighborEntry {
  ip: string;
  mac: string;
  interface: string;
  state: string;
}

export interface DhcpLease {
  mac: string;
  ip: string;
  hostname: string | null;
  expires_at: number | null;
  source: string | null;
}

export interface DeviceCapabilities {
  iw: boolean;
  ip: boolean;
  nmcli: boolean;
  nftables: boolean;
  wireless_interfaces: string[];
  wifi_disconnect: boolean;
  internet_block: boolean;
  dhcp_leases_readable: boolean;
}

export interface ConnectedClient {
  mac: string;
  ip: string | null;
  hostname: string | null;
  interface: string | null;
  sources: string[];
  wifi: WifiStationInfo | null;
  neighbor: NeighborEntry | null;
  lease: DhcpLease | null;
  state: DeviceState;
  vendor: string | null;
  device_type: DeviceType;
  signal_dbm: number | null;
  first_seen: string | null;
  last_seen: string | null;
  flags: DeviceFlags;
}

export interface ConnectedDevicesResponse {
  interface: string | null;
  interfaces: string[];
  count: number;
  counts: Partial<Record<DeviceState, number>>;
  capabilities: DeviceCapabilities;
  clients: ConnectedClient[];
  checked_at: string;
}

export interface KnownDevice {
  id: number;
  mac: string;
  hostname: string | null;
  nickname: string | null;
  device_type: DeviceType;
  vendor: string | null;
  first_seen: string;
  last_seen: string;
  is_known: boolean;
  internet_blocked: boolean;
  banned: boolean;
  notes: string | null;
  last_ip: string | null;
  last_interface: string | null;
  last_state: DeviceState | null;
  connection_last_seen: string | null;
  is_online: boolean;
}

export interface KnownDevicesResponse {
  count: number;
  total: number;
  limit: number;
  offset: number;
  devices: KnownDevice[];
}

export interface DeviceAddress {
  ip: string;
  interface: string | null;
  first_seen: string | null;
  last_seen: string | null;
}

export interface DeviceConnection {
  id: number;
  mac: string;
  ip: string | null;
  interface: string | null;
  connection_type: string;
  state: string;
  signal_dbm: number | null;
  rx_bytes: number | null;
  tx_bytes: number | null;
  connected_at: string | null;
  disconnected_at: string | null;
  last_seen: string | null;
}

export interface DeviceEvent {
  id: number;
  type: string;
  severity: string;
  message: string;
  created_at: string;
}

export interface DeviceDetails {
  id: number;
  mac: string;
  hostname: string | null;
  nickname: string | null;
  device_type: DeviceType;
  vendor: string | null;
  first_seen: string;
  last_seen: string;
  is_known: boolean;
  internet_blocked: boolean;
  banned: boolean;
  notes: string | null;
  addresses: DeviceAddress[];
  connections: DeviceConnection[];
  events: DeviceEvent[];
}

export interface DeviceSummary {
  total_devices: number;
  online_devices: number;
  blocked_devices: number;
}

// ---------------------------------------------------------------------------
// Monitoring
// ---------------------------------------------------------------------------

export interface TrafficRates {
  rx_bytes_per_second: number;
  tx_bytes_per_second: number;
  rx_packets_per_second: number;
  tx_packets_per_second: number;
  rx_bits_per_second: number;
  tx_bits_per_second: number;
  interval_seconds: number;
}

export interface TrafficSample {
  rx_bytes: number;
  tx_bytes: number;
  rx_packets: number;
  tx_packets: number;
  sampled_at: string;
  sampled_at_ms: number;
}

export interface MonitoringSnapshot {
  interface: string;
  available: boolean;
  counters: {
    rx_bytes: number;
    tx_bytes: number;
    rx_packets: number;
    tx_packets: number;
  } | null;
  rates: TrafficRates | null;
  reset_detected: boolean;
  window_seconds: number;
  sampled_at?: string | null;
  sampling_since?: string | null;
  history: TrafficSample[];
  clients: { wifi_stations: number } | null;
  hotspot: { active: boolean; connection: string | null } | null;
  checked_at: string | null;
  message?: string;
}

export interface MonitoringHistoryResponse {
  interface: string;
  minutes: number;
  count: number;
  samples: TrafficSample[];
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export interface AppEvent {
  id: number;
  type: string;
  severity: string;
  message: string;
  mac: string | null;
  ip: string | null;
  interface: string | null;
  metadata: Record<string, unknown> | null;
  created_at: number;
}

export interface EventsResponse {
  count: number;
  total: number;
  limit: number;
  offset: number;
  events: AppEvent[];
}

// ---------------------------------------------------------------------------
// System
// ---------------------------------------------------------------------------

export interface SystemInfo {
  hostname: string;
  platform: string;
  system: string;
  kernel: string;
  architecture: string;
  python: string;
  environment: string;
  machine: {
    hostname: string;
    vendor: string | null;
    model: string | null;
    board: string | null;
    os: string;
    os_version: string | null;
    kernel: string;
    architecture: string;
    cpu: string | null;
    container: boolean;
    is_zimaos: boolean;
    summary: string;
  };
  wifi: {
    present: boolean;
    count: number;
    interfaces: Array<{
      name: string;
      driver: string | null;
      bus: string | null;
      vendor_id: string | null;
      device_id: string | null;
      model: string | null;
    }>;
    controllers: Array<{
      slot: string;
      vendor_id: string | null;
      device_id: string | null;
      driver: string | null;
      model: string | null;
    }>;
    summary: string;
  };
  uptime_seconds: number | null;
  memory: {
    total_bytes: number;
    available_bytes: number;
    used_bytes: number;
  } | null;
  disk: {
    total_bytes: number;
    used_bytes: number;
    free_bytes: number;
  } | null;
  database: {
    path: string;
    exists: boolean;
    size_bytes: number | null;
    wal_size_bytes: number | null;
    integrity: string | null;
    journal_mode: string | null;
    sqlite_version: string;
  };
  backend: {
    nmcli: boolean;
    nmcli_version: string | null;
    iw: boolean;
    ip: boolean;
    nft: boolean;
    network_manager: Record<string, string>;
  };
  network: {
    interfaces: Array<{
      name: string;
      type: string;
      state: string;
      connection: string | null;
    }>;
    wireless: Array<Record<string, unknown>>;
    default_route_interface: string | null;
  };
  devices: DeviceSummary;
  timestamp: string;
}

export type CheckStatus = "ok" | "warn" | "error" | "unsupported";

export interface DiagnosticCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  hint: string | null;
}

export interface DiagnosticsResponse {
  summary: Record<CheckStatus, number>;
  checks: DiagnosticCheck[];
  database: SystemInfo["database"];
  timestamp: string;
}
