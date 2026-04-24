import { apiClient } from './client';
import type { DenoProxyListResponse, DenoProxyProbeResponse, DenoProxyUsageItem } from '@/types';

const normalizeUsageItem = (item: DenoProxyUsageItem): DenoProxyUsageItem => ({
  ...item,
  used_by: Array.isArray(item.used_by) ? item.used_by : [],
});

export const denoProxiesApi = {
  list: async () => {
    const response = await apiClient.get<DenoProxyListResponse>('/deno-proxies');
    return {
      ...response,
      items: Array.isArray(response.items) ? response.items.map(normalizeUsageItem) : [],
      unmanaged_in_use: Array.isArray(response.unmanaged_in_use)
        ? response.unmanaged_in_use.map(normalizeUsageItem)
        : [],
    };
  },

  replace: (hosts: string[]) => apiClient.put('/deno-proxies', { items: hosts }),

  patch: (payload: { add?: string[]; remove?: string[] }) =>
    apiClient.patch('/deno-proxies', payload),

  deleteHost: (host: string) =>
    apiClient.delete(`/deno-proxies?host=${encodeURIComponent(host.trim())}`),

  probe: (host: string) => apiClient.post<DenoProxyProbeResponse>('/deno-proxies/probe', { host }),
};
