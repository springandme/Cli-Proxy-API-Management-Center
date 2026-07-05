import { apiClient } from './client';

export interface CodexInspectionScheduleConfig {
  mode?: string;
  timePoints?: string[];
  intervalMinutes?: number;
  timeZone?: string;
}

export interface CodexInspectionConfig {
  enabled?: boolean | null;
  schedule?: CodexInspectionScheduleConfig;
  targetType?: string;
  workers?: number;
  deleteWorkers?: number;
  timeout?: number;
  retries?: number;
  userAgent?: string;
  usedPercentThreshold?: number;
  sampleSize?: number;
  autoActionMode?: string;
  shortWindowAutoDisable?: boolean;
}

export interface CodexInspectionRun {
  id: number;
  triggerType: string;
  triggerKey?: string;
  status: string;
  totalCount?: number;
  totalFiles?: number;
  probeSetCount?: number;
  sampledCount?: number;
  enabledCount?: number;
  disabledCount?: number;
  deleteCount?: number;
  disableCount?: number;
  enableCount?: number;
  reauthCount?: number;
  keepCount?: number;
  error?: string;
  startedAtMs?: number;
  finishedAtMs?: number;
  createdAtMs?: number;
}

export interface CodexInspectionQuotaWindow {
  id: string;
  labelKey?: string;
  usedPercent?: number;
  resetLabel?: string;
  limitWindowSeconds?: number;
  resetAtMs?: number;
}

export interface CodexInspectionResult {
  id: number;
  runId: number;
  accountKey?: string;
  fileName: string;
  displayAccount: string;
  authIndex?: string;
  accountId?: string;
  provider?: string;
  disabled?: boolean;
  status?: string;
  state?: string;
  planType?: string;
  action: string;
  actionReason?: string;
  actionStatus?: string;
  executedAction?: string;
  actionError?: string;
  statusCode?: number;
  usedPercent?: number;
  isQuota?: boolean;
  quotaWindows?: CodexInspectionQuotaWindow[];
  errorKind?: string;
  errorDetail?: string;
  cooldownUntilMs?: number;
  cooldownWindowId?: string;
  cooldownReason?: string;
  createdAtMs?: number;
}

export interface CodexInspectionLog {
  id: number;
  runId: number;
  level: string;
  message: string;
  detail?: unknown;
  createdAtMs?: number;
}

export interface CodexInspectionCooldown {
  id: number;
  status: string;
  source: string;
  authId?: string;
  authIndex?: string;
  accountId?: string;
  fileName: string;
  displayAccount: string;
  provider?: string;
  windowId: string;
  reason?: string;
  triggeredAtMs?: number;
  restoreAtMs?: number;
  restoredAtMs?: number;
  error?: string;
  createdAtMs?: number;
  updatedAtMs?: number;
}

export interface CodexInspectionDetail {
  run: CodexInspectionRun;
  results: CodexInspectionResult[];
  logs: CodexInspectionLog[];
}

export interface CodexInspectionActionResult {
  outcomes: Array<{
    resultId?: number;
    fileName: string;
    displayAccount: string;
    action: string;
    status: string;
    success: boolean;
    error?: string;
  }>;
  detail: CodexInspectionDetail;
}

interface ListResponse<T> {
  items?: T[];
}

export const codexInspectionApi = {
  getConfig: () => apiClient.get<CodexInspectionConfig>('/codex-inspection/config'),
  updateConfig: (config: CodexInspectionConfig) =>
    apiClient.put<CodexInspectionConfig>('/codex-inspection/config', config),
  listRuns: async (limit = 20) => {
    const response = await apiClient.get<ListResponse<CodexInspectionRun>>('/codex-inspection/runs', {
      params: { limit },
    });
    return response.items || [];
  },
  runNow: () => apiClient.post<CodexInspectionDetail>('/codex-inspection/run', {}),
  getRun: (id: number) => apiClient.get<CodexInspectionDetail>(`/codex-inspection/runs/${id}`),
  executeActions: (runId: number, resultIds: number[]) =>
    apiClient.post<CodexInspectionActionResult>(`/codex-inspection/runs/${runId}/actions`, {
      resultIds,
    }),
  listCooldowns: async (includeResolved = true, limit = 50) => {
    const response = await apiClient.get<ListResponse<CodexInspectionCooldown>>(
      '/codex-inspection/cooldowns',
      {
        params: { includeResolved, limit },
      }
    );
    return response.items || [];
  },
};
