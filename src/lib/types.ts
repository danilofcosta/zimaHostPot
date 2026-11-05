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

export interface ApiErrorPayload {
  code?: string;
  message?: string;
  details?: unknown;
  request_id?: string;
}

export interface ApiErrorEnvelope {
  error?: ApiErrorPayload;
}
