import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SecondaryScreenShell } from '@/components/common/SecondaryScreenShell';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { denoProxiesApi } from '@/services/api/denoProxies';
import { useAuthStore, useNotificationStore } from '@/stores';
import type { DenoProxyListResponse, DenoProxyUsageItem } from '@/types';
import { copyToClipboard } from '@/utils/clipboard';
import {
  denoProxyProbeLooksHealthy,
  normalizeDenoProxyHostForMatch,
  parseBulkDenoProxyHosts,
} from '@/features/denoProxies/utils';
import styles from './DenoProxiesPage.module.scss';

type LocationState = { fromAuthFiles?: boolean } | null;
type FilterMode = 'all' | 'in-use' | 'unused' | 'unmanaged-in-use';
type DenoProxySortMode = 'usage-desc' | 'usage-asc' | 'host-asc' | 'host-desc';
type PageSizeOption = 10 | 20 | 50;
type DenoProxyListEntry = {
  item: DenoProxyUsageItem;
  managed: boolean;
};

type Translator = (key: string, options?: Record<string, unknown>) => string;

const formatUsageSourceLabel = (source: string, t: Translator) => {
  switch (source) {
    case 'auth-file':
      return t('deno_proxies.source_codex_auth');
    case 'runtime-auth':
      return t('deno_proxies.source_codex_auth');
    case 'codex-api-key':
      return t('deno_proxies.source_codex_api_key');
    default:
      return source;
  }
};

export function DenoProxiesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const disableControls = connectionStatus !== 'connected';

  const [data, setData] = useState<DenoProxyListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const initialSearch = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return String(params.get('search') ?? '').trim();
  }, [location.search]);
  const [search, setSearch] = useState(initialSearch);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [sortMode, setSortMode] = useState<DenoProxySortMode>('usage-asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(10);
  const [bulkInput, setBulkInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [busyHost, setBusyHost] = useState('');

  useEffect(() => {
    setSearch(initialSearch);
  }, [initialSearch]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await denoProxiesApi.list();
      setData(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('notification.refresh_failed');
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleBack = useCallback(() => {
    const state = location.state as LocationState;
    if (state?.fromAuthFiles) {
      navigate(-1);
      return;
    }
    navigate('/auth-files', { replace: true });
  }, [location.state, navigate]);

  const entries = useMemo<DenoProxyListEntry[]>(() => {
    const managed = (data?.items ?? []).map((item) => ({ item, managed: true }));
    const unmanaged = (data?.unmanaged_in_use ?? []).map((item) => ({
      item,
      managed: false,
    }));
    return [...managed, ...unmanaged];
  }, [data?.items, data?.unmanaged_in_use]);

  const filterOptions = useMemo(
    () => [
      { value: 'all', label: t('deno_proxies.filter_all') },
      { value: 'in-use', label: t('deno_proxies.filter_in_use') },
      { value: 'unused', label: t('deno_proxies.filter_unused') },
      { value: 'unmanaged-in-use', label: t('deno_proxies.filter_unmanaged') },
    ],
    [t]
  );

  const sortOptions = useMemo(
    () => [
      { value: 'usage-asc', label: t('deno_proxies.picker_sort_usage_asc') },
      { value: 'usage-desc', label: t('deno_proxies.picker_sort_usage_desc') },
      { value: 'host-asc', label: t('deno_proxies.picker_sort_host_asc') },
      { value: 'host-desc', label: t('deno_proxies.picker_sort_host_desc') },
    ],
    [t]
  );

  const pageSizeOptions = useMemo(
    () => [
      { value: '10', label: '10 / page' },
      { value: '20', label: '20 / page' },
      { value: '50', label: '50 / page' },
    ],
    []
  );

  const filteredEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    const exactHostQuery = normalizeDenoProxyHostForMatch(search);
    const filtered = entries.filter((entry) => {
      if (filter === 'in-use' && entry.item.usage_count <= 0) return false;
      if (filter === 'unused' && !entry.item.unused) return false;
      if (filter === 'unmanaged-in-use' && entry.managed) return false;

      if (!query) return true;
      const haystack = [
        entry.item.host,
        ...entry.item.used_by.flatMap((ref) => [
          ref.name ?? '',
          ref.label ?? '',
          ref.fileName ?? '',
          ref.source,
        ]),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });

    filtered.sort((left, right) => {
      const leftExact = exactHostQuery !== '' && left.item.host === exactHostQuery;
      const rightExact = exactHostQuery !== '' && right.item.host === exactHostQuery;
      if (leftExact !== rightExact) {
        return leftExact ? -1 : 1;
      }
      if (sortMode === 'usage-desc') {
        if (right.item.usage_count !== left.item.usage_count) {
          return right.item.usage_count - left.item.usage_count;
        }
        return left.item.host.localeCompare(right.item.host);
      }
      if (sortMode === 'usage-asc') {
        if (left.item.usage_count !== right.item.usage_count) {
          return left.item.usage_count - right.item.usage_count;
        }
        return left.item.host.localeCompare(right.item.host);
      }
      if (sortMode === 'host-desc') {
        return right.item.host.localeCompare(left.item.host);
      }
      return left.item.host.localeCompare(right.item.host);
    });

    return filtered;
  }, [entries, filter, search, sortMode]);

  useEffect(() => {
    setPage(1);
  }, [search, filter, sortMode, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / pageSize));
  const currentPage = Math.min(page, totalPages);

  useEffect(() => {
    if (page !== currentPage) {
      setPage(currentPage);
    }
  }, [currentPage, page]);

  const pagedEntries = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredEntries.slice(start, start + pageSize);
  }, [currentPage, filteredEntries, pageSize]);

  const handleBulkAdd = async () => {
    const { hosts, invalid } = parseBulkDenoProxyHosts(bulkInput);
    if (hosts.length === 0) {
      const message =
        invalid.length > 0
          ? `${t('deno_proxies.bulk_invalid_only')} ${invalid.slice(0, 3).join(', ')}`
          : t('deno_proxies.bulk_empty');
      showNotification(message, 'error');
      return;
    }

    setSubmitting(true);
    try {
      await denoProxiesApi.patch({ add: hosts });
      setBulkInput('');
      await loadData();
      const invalidSuffix =
        invalid.length > 0
          ? ` ${t('deno_proxies.invalid_suffix')} ${invalid.slice(0, 3).join(', ')}`
          : '';
      showNotification(
        `${t('deno_proxies.bulk_added', { count: hosts.length })}${invalidSuffix}`,
        'success'
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('notification.update_failed');
      showNotification(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleProbe = async (host: string) => {
    setBusyHost(host);
    try {
      const result = await denoProxiesApi.probe(host);
      showNotification(result.summary, denoProxyProbeLooksHealthy(result) ? 'success' : 'error');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('notification.update_failed');
      showNotification(message, 'error');
    } finally {
      setBusyHost('');
    }
  };

  const handleCopy = async (host: string) => {
    const copied = await copyToClipboard(host);
    showNotification(
      copied ? t('notification.link_copied') : t('notification.copy_failed'),
      copied ? 'success' : 'error'
    );
  };

  const handleAddUnmanaged = async (host: string) => {
    setBusyHost(host);
    try {
      await denoProxiesApi.patch({ add: [host] });
      await loadData();
      showNotification(t('deno_proxies.added_to_pool'), 'success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('notification.update_failed');
      showNotification(message, 'error');
    } finally {
      setBusyHost('');
    }
  };

  const handleDelete = async (entry: DenoProxyUsageItem) => {
    const warning =
      entry.usage_count > 0
        ? t('deno_proxies.delete_in_use_warning')
        : t('deno_proxies.delete_confirm');
    if (!window.confirm(warning)) {
      return;
    }

    setBusyHost(entry.host);
    try {
      await denoProxiesApi.deleteHost(entry.host);
      await loadData();
      showNotification(t('notification.delete_success'), 'success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('notification.delete_failed');
      showNotification(message, 'error');
    } finally {
      setBusyHost('');
    }
  };

  return (
    <SecondaryScreenShell
      title={t('deno_proxies.page_title')}
      onBack={handleBack}
      backLabel={t('nav.auth_files')}
      rightAction={
        <Button variant="secondary" size="sm" onClick={() => void loadData()} disabled={loading}>
          {t('common.refresh')}
        </Button>
      }
      isLoading={loading}
      loadingLabel={t('common.loading')}
    >
      <div className={styles.container}>
        <Card
          title={t('deno_proxies.bulk_title')}
          extra={
            <div className={styles.bulkActions}>
              <Button
                size="sm"
                onClick={() => {
                  void handleBulkAdd();
                }}
                disabled={disableControls || submitting}
                loading={submitting}
              >
                {t('deno_proxies.bulk_submit')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setBulkInput('')}
                disabled={disableControls || submitting || !bulkInput.trim()}
              >
                {t('common.clear')}
              </Button>
            </div>
          }
        >
          <div className={styles.bulkBody}>
            <textarea
              className={`input ${styles.textarea}`}
              value={bulkInput}
              onChange={(event) => setBulkInput(event.target.value)}
              placeholder={t('deno_proxies.bulk_placeholder')}
              disabled={disableControls || submitting}
            />
            <div className="hint">{t('deno_proxies.bulk_hint')}</div>
          </div>
        </Card>

        <Card title={t('deno_proxies.list_title')}>
          {error && <div className="error-box">{error}</div>}
          <div className={styles.toolbar}>
            <div className={styles.toolbarRow}>
              <div className={styles.searchWrap}>
                <Input
                  label={t('auth_files.search_label')}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t('deno_proxies.search_placeholder')}
                />
              </div>
              <div className={styles.filterWrap}>
                <label>{t('deno_proxies.filter_label')}</label>
                <Select
                  value={filter}
                  options={filterOptions}
                  onChange={(value) => setFilter(value as FilterMode)}
                  ariaLabel={t('deno_proxies.filter_label')}
                  fullWidth
                />
              </div>
              <div className={styles.filterWrap}>
                <label>{t('deno_proxies.picker_sort_label')}</label>
                <Select
                  value={sortMode}
                  options={sortOptions}
                  onChange={(value) => setSortMode(value as DenoProxySortMode)}
                  ariaLabel={t('deno_proxies.picker_sort_label')}
                  fullWidth
                />
              </div>
              <div className={styles.filterWrap}>
                <label>{t('deno_proxies.page_size_label')}</label>
                <Select
                  value={String(pageSize)}
                  options={pageSizeOptions}
                  onChange={(value) => setPageSize(Number(value) as PageSizeOption)}
                  ariaLabel={t('deno_proxies.page_size_label')}
                  fullWidth
                />
              </div>
            </div>
          </div>

          {filteredEntries.length === 0 ? (
            <div className={styles.empty}>{t('deno_proxies.empty')}</div>
          ) : (
            <div className={styles.hostList}>
              {pagedEntries.map((entry) => (
                <div
                  key={`${entry.managed ? 'managed' : 'unmanaged'}:${entry.item.host}`}
                  className={styles.hostCard}
                >
                  <div className={styles.hostHeader}>
                    <div className={styles.hostIdentity}>
                      <span className={styles.hostTitle}>{entry.item.host}</span>
                      <div className={styles.badgeRow}>
                        <span
                          className={`${styles.badge} ${entry.managed ? styles.badgeManaged : styles.badgeWarn}`}
                        >
                          {entry.managed
                            ? t('deno_proxies.badge_managed')
                            : t('deno_proxies.badge_unmanaged')}
                        </span>
                        <span className={styles.badge}>
                          {entry.item.unused
                            ? t('deno_proxies.badge_unused')
                            : t('deno_proxies.badge_usage_count', {
                                count: entry.item.usage_count,
                              })}
                        </span>
                      </div>
                    </div>
                    <div className={styles.hostActions}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          void handleCopy(entry.item.host);
                        }}
                      >
                        {t('common.copy')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          void handleProbe(entry.item.host);
                        }}
                        loading={busyHost === entry.item.host}
                        disabled={busyHost !== '' && busyHost !== entry.item.host}
                      >
                        {t('common.test')}
                      </Button>
                      {entry.managed ? (
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => {
                            void handleDelete(entry.item);
                          }}
                          disabled={
                            disableControls || (busyHost !== '' && busyHost !== entry.item.host)
                          }
                        >
                          {t('common.delete')}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => {
                            void handleAddUnmanaged(entry.item.host);
                          }}
                          disabled={
                            disableControls || (busyHost !== '' && busyHost !== entry.item.host)
                          }
                        >
                          {t('deno_proxies.add_to_pool')}
                        </Button>
                      )}
                    </div>
                  </div>

                  {entry.item.used_by.length > 0 ? (
                    <div className={styles.usedByList}>
                      {entry.item.used_by.map((usedBy) => (
                        <div
                          key={`${usedBy.source}:${usedBy.id ?? usedBy.name ?? usedBy.fileName}`}
                          className={styles.usedByItem}
                        >
                          <span className={styles.usedByName}>
                            {usedBy.name || usedBy.fileName || usedBy.id || usedBy.source}
                          </span>
                          <span className={styles.usedByMeta}>
                            {[
                              formatUsageSourceLabel(usedBy.source, t),
                              usedBy.fileName &&
                              usedBy.fileName !== usedBy.name &&
                              usedBy.fileName !== usedBy.label
                                ? usedBy.fileName
                                : '',
                              usedBy.authIndex,
                              usedBy.baseUrl,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="hint">{t('deno_proxies.no_usage')}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {filteredEntries.length > pageSize && (
            <div className={styles.pagination}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
              >
                {t('auth_files.pagination_prev')}
              </Button>
              <div className={styles.pageInfo}>
                {t('auth_files.pagination_info', {
                  current: currentPage,
                  total: totalPages,
                  count: filteredEntries.length,
                })}
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage >= totalPages}
              >
                {t('auth_files.pagination_next')}
              </Button>
            </div>
          )}
        </Card>
      </div>
    </SecondaryScreenShell>
  );
}
