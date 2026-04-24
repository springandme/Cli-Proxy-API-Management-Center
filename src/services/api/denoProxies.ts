import { apiClient } from './client';
import type { DenoProxyListResponse, DenoProxyProbeResponse } from '@/types';

export const denoProxiesApi = {
  list: () => apiClient.get<DenoProxyListResponse>('/deno-proxies'),

  replace: (hosts: string[]) => apiClient.put('/deno-proxies', { items: hosts }),

  patch: (payload: { add?: string[]; remove?: string[] }) =>
    apiClient.patch('/deno-proxies', payload),

  deleteHost: (host: string) =>
    apiClient.delete(`/deno-proxies?host=${encodeURIComponent(host.trim())}`),

  probe: (host: string) => apiClient.post<DenoProxyProbeResponse>('/deno-proxies/probe', { host }),
};
