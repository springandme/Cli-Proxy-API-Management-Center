export interface DenoProxyUsageRef {
  source: string;
  id?: string;
  name?: string;
  label?: string;
  provider?: string;
  authIndex?: string;
  fileName?: string;
  prefix?: string;
  baseUrl?: string;
  runtimeOnly?: boolean;
}

export interface DenoProxyUsageItem {
  host: string;
  usage_count: number;
  used_by: DenoProxyUsageRef[];
  unused: boolean;
}

export interface DenoProxyListResponse {
  items: DenoProxyUsageItem[];
  unmanaged_in_use: DenoProxyUsageItem[];
  managed_hosts?: string[];
  unmanaged_hosts?: string[];
  total_usage_count?: number;
}

export interface DenoProxyProbeCheck {
  ok: boolean;
  statusCode?: number;
  detail?: string;
  error?: string;
}

export interface DenoProxyProbeResponse {
  host: string;
  root: DenoProxyProbeCheck;
  robots: DenoProxyProbeCheck;
  codexHttp: DenoProxyProbeCheck;
  codexWebsocket: DenoProxyProbeCheck;
  checkedAt: string;
  latencyMs: number;
  summary: string;
}
