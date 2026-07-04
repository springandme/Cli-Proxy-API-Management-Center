import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useAuthStore, useNotificationStore } from '@/stores';
import { codexInspectionApi } from '@/services/api';
import type {
  CodexInspectionConfig,
  CodexInspectionCooldown,
  CodexInspectionDetail,
  CodexInspectionResult,
  CodexInspectionRun,
} from '@/services/api';
import styles from './CodexInspectionPage.module.scss';

type ResultFilter = 'all' | 'disable' | 'enable' | 'delete' | 'reauth' | 'keep' | 'failed';

const ACTION_FILTERS: ResultFilter[] = ['all', 'disable', 'enable', 'delete', 'reauth', 'keep', 'failed'];

const ACTIONABLE_ACTIONS = new Set(['disable', 'enable', 'delete']);

const DEFAULT_CONFIG: CodexInspectionConfig = {
  enabled: false,
  schedule: {
    mode: 'interval',
    intervalMinutes: 60,
    timeZone: 'Asia/Shanghai',
    timePoints: [],
  },
  targetType: 'all',
  workers: 4,
  deleteWorkers: 4,
  timeout: 30,
  retries: 1,
  userAgent: '',
  usedPercentThreshold: 100,
  sampleSize: 0,
  autoActionMode: 'none',
  shortWindowAutoDisable: false,
};

function normalizeConfig(config?: CodexInspectionConfig): CodexInspectionConfig {
  return {
    ...DEFAULT_CONFIG,
    ...(config || {}),
    schedule: {
      ...DEFAULT_CONFIG.schedule,
      ...(config?.schedule || {}),
      timePoints: config?.schedule?.timePoints || [],
    },
  };
}

function formatTime(value?: number) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function formatDuration(start?: number, end?: number) {
  if (!start || !end || end < start) return '-';
  const seconds = Math.round((end - start) / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function formatPercent(value?: number) {
  if (value === undefined || value === null || Number.isNaN(value)) return '-';
  return `${Math.round(value * 10) / 10}%`;
}

function statusClass(status?: string) {
  switch (status) {
    case 'completed':
    case 'success':
    case 'restored':
      return styles.statusSuccess;
    case 'running':
    case 'pending':
    case 'needs_review':
      return styles.statusWarning;
    case 'failed':
    case 'canceled':
      return styles.statusDanger;
    default:
      return styles.statusMuted;
  }
}

function resultMatchesFilter(result: CodexInspectionResult, filter: ResultFilter) {
  if (filter === 'all') return true;
  if (filter === 'failed') {
    return result.actionStatus === 'failed' || Boolean(result.errorKind || result.errorDetail);
  }
  return result.action === filter;
}

function actionLabelKey(action?: string) {
  return `codex_inspection.action.${action || 'unknown'}`;
}

function statusLabelKey(status?: string) {
  return `codex_inspection.status.${status || 'unknown'}`;
}

function cooldownStatusLabelKey(status?: string) {
  return `codex_inspection.cooldown_status.${status || 'unknown'}`;
}

function isActionable(result: CodexInspectionResult) {
  return ACTIONABLE_ACTIONS.has(result.action) && result.actionStatus !== 'success';
}

export function CodexInspectionPage() {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const disabled = connectionStatus !== 'connected';

  const [config, setConfig] = useState<CodexInspectionConfig>(DEFAULT_CONFIG);
  const [runs, setRuns] = useState<CodexInspectionRun[]>([]);
  const [detail, setDetail] = useState<CodexInspectionDetail | null>(null);
  const [cooldowns, setCooldowns] = useState<CodexInspectionCooldown[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<ResultFilter>('all');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextConfig, nextRuns, nextCooldowns] = await Promise.all([
        codexInspectionApi.getConfig(),
        codexInspectionApi.listRuns(30),
        codexInspectionApi.listCooldowns(true, 80),
      ]);
      setConfig(normalizeConfig(nextConfig));
      setRuns(nextRuns);
      setCooldowns(nextCooldowns);
      if (nextRuns[0]?.id) {
        setDetail(await codexInspectionApi.getRun(nextRuns[0].id));
      } else {
        setDetail(null);
      }
      setSelectedIds(new Set());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('notification.refresh_failed');
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useHeaderRefresh(loadAll);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const filteredResults = useMemo(
    () => (detail?.results || []).filter((item) => resultMatchesFilter(item, filter)),
    [detail?.results, filter]
  );

  const actionableFilteredResults = useMemo(
    () => filteredResults.filter(isActionable),
    [filteredResults]
  );

  const filterCounts = useMemo(() => {
    const results = detail?.results || [];
    return ACTION_FILTERS.reduce<Record<ResultFilter, number>>((acc, key) => {
      acc[key] = results.filter((item) => resultMatchesFilter(item, key)).length;
      return acc;
    }, {} as Record<ResultFilter, number>);
  }, [detail?.results]);

  const selectedActionableIds = useMemo(() => {
    const actionable = new Set(actionableFilteredResults.map((item) => item.id));
    return Array.from(selectedIds).filter((id) => actionable.has(id));
  }, [actionableFilteredResults, selectedIds]);

  const updateConfig = (patch: Partial<CodexInspectionConfig>) => {
    setConfig((prev) => normalizeConfig({ ...prev, ...patch }));
  };

  const updateSchedule = (patch: Partial<NonNullable<CodexInspectionConfig['schedule']>>) => {
    setConfig((prev) =>
      normalizeConfig({
        ...prev,
        schedule: {
          ...(prev.schedule || {}),
          ...patch,
        },
      })
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const saved = await codexInspectionApi.updateConfig(config);
      setConfig(normalizeConfig(saved));
      showNotification(t('codex_inspection.config_saved'), 'success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('codex_inspection.config_save_failed');
      setError(message);
      showNotification(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRunNow = async () => {
    setRunning(true);
    setError('');
    try {
      const nextDetail = await codexInspectionApi.runNow();
      const [nextRuns, nextCooldowns] = await Promise.all([
        codexInspectionApi.listRuns(30),
        codexInspectionApi.listCooldowns(true, 80),
      ]);
      setDetail(nextDetail);
      setRuns(nextRuns);
      setCooldowns(nextCooldowns);
      setSelectedIds(new Set());
      showNotification(t('codex_inspection.run_finished'), 'success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('codex_inspection.run_failed');
      setError(message);
      showNotification(message, 'error');
    } finally {
      setRunning(false);
    }
  };

  const handleSelectRun = async (run: CodexInspectionRun) => {
    setLoading(true);
    setError('');
    try {
      setDetail(await codexInspectionApi.getRun(run.id));
      setSelectedIds(new Set());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('notification.refresh_failed');
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelected = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAllActionable = () => {
    setSelectedIds((prev) => {
      const actionableIds = actionableFilteredResults.map((item) => item.id);
      const hasAll = actionableIds.length > 0 && actionableIds.every((id) => prev.has(id));
      const next = new Set(prev);
      for (const id of actionableIds) {
        if (hasAll) {
          next.delete(id);
        } else {
          next.add(id);
        }
      }
      return next;
    });
  };

  const handleExecuteSelected = async () => {
    if (!detail?.run.id || selectedActionableIds.length === 0) return;
    setActing(true);
    setError('');
    try {
      const result = await codexInspectionApi.executeActions(detail.run.id, selectedActionableIds);
      setDetail(result.detail);
      setRuns(await codexInspectionApi.listRuns(30));
      setSelectedIds(new Set());
      showNotification(t('codex_inspection.actions_finished'), 'success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('codex_inspection.actions_failed');
      setError(message);
      showNotification(message, 'error');
    } finally {
      setActing(false);
    }
  };

  const currentRun = detail?.run;
  const pendingCooldowns = cooldowns.filter((item) => item.status === 'pending').length;

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>{t('codex_inspection.title')}</h1>
          <p className={styles.description}>{t('codex_inspection.description')}</p>
        </div>
        <div className={styles.headerActions}>
          <Button variant="secondary" size="sm" onClick={loadAll} disabled={disabled || loading}>
            {t('common.refresh')}
          </Button>
          <Button variant="primary" size="sm" onClick={handleRunNow} loading={running} disabled={disabled}>
            {t('codex_inspection.run_now')}
          </Button>
        </div>
      </div>

      {error && <div className={styles.errorBox}>{error}</div>}

      <div className={styles.summaryGrid}>
        <Card className={styles.summaryCard}>
          <span className={styles.summaryLabel}>{t('codex_inspection.last_run')}</span>
          <strong>{currentRun ? t(statusLabelKey(currentRun.status)) : '-'}</strong>
          <small>
            {formatTime(currentRun?.finishedAtMs || currentRun?.startedAtMs)} ·{' '}
            {formatDuration(currentRun?.startedAtMs, currentRun?.finishedAtMs)}
          </small>
        </Card>
        <Card className={styles.summaryCard}>
          <span className={styles.summaryLabel}>{t('codex_inspection.accounts')}</span>
          <strong>{currentRun?.totalCount ?? 0}</strong>
          <small>
            {t('codex_inspection.summary_actions', {
              disable: currentRun?.disableCount ?? 0,
              enable: currentRun?.enableCount ?? 0,
              delete: currentRun?.deleteCount ?? 0,
            })}
          </small>
        </Card>
        <Card className={styles.summaryCard}>
          <span className={styles.summaryLabel}>{t('codex_inspection.pending_cooldowns')}</span>
          <strong>{pendingCooldowns}</strong>
          <small>{t('codex_inspection.short_window_state')}</small>
        </Card>
      </div>

      <div className={styles.configGrid}>
        <Card title={t('codex_inspection.config_title')} className={styles.configCard}>
          <div className={styles.settingList}>
            <label className={styles.switchRow}>
              <span>
                <strong>{t('codex_inspection.enabled')}</strong>
                <small>{t('codex_inspection.enabled_hint')}</small>
              </span>
              <ToggleSwitch
                checked={Boolean(config.enabled)}
                onChange={(enabled) => updateConfig({ enabled })}
                disabled={disabled}
                ariaLabel={t('codex_inspection.enabled')}
              />
            </label>
            <label className={styles.switchRow}>
              <span>
                <strong>{t('codex_inspection.short_window_auto_disable')}</strong>
                <small>{t('codex_inspection.short_window_auto_disable_hint')}</small>
              </span>
              <ToggleSwitch
                checked={Boolean(config.shortWindowAutoDisable)}
                onChange={(shortWindowAutoDisable) => updateConfig({ shortWindowAutoDisable })}
                disabled={disabled}
                ariaLabel={t('codex_inspection.short_window_auto_disable')}
              />
            </label>
            <div className={styles.fieldGrid}>
              <label>
                <span>{t('codex_inspection.auto_action')}</span>
                <select
                  value={config.autoActionMode || 'none'}
                  onChange={(event) => updateConfig({ autoActionMode: event.target.value })}
                  disabled={disabled}
                >
                  <option value="none">{t('codex_inspection.auto_action_none')}</option>
                  <option value="enable">{t('codex_inspection.auto_action_enable')}</option>
                  <option value="disable">{t('codex_inspection.auto_action_disable')}</option>
                  <option value="delete">{t('codex_inspection.auto_action_delete')}</option>
                </select>
              </label>
              <label>
                <span>{t('codex_inspection.interval_minutes')}</span>
                <input
                  type="number"
                  min={1}
                  value={config.schedule?.intervalMinutes || 60}
                  onChange={(event) =>
                    updateSchedule({ intervalMinutes: Number(event.target.value) || 60 })
                  }
                  disabled={disabled}
                />
              </label>
              <label>
                <span>{t('codex_inspection.threshold')}</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={config.usedPercentThreshold || 100}
                  onChange={(event) =>
                    updateConfig({ usedPercentThreshold: Number(event.target.value) || 100 })
                  }
                  disabled={disabled}
                />
              </label>
              <label>
                <span>{t('codex_inspection.workers')}</span>
                <input
                  type="number"
                  min={1}
                  value={config.workers || 4}
                  onChange={(event) => updateConfig({ workers: Number(event.target.value) || 4 })}
                  disabled={disabled}
                />
              </label>
            </div>
            <div className={styles.cardActions}>
              <Button variant="primary" size="sm" onClick={handleSave} loading={saving} disabled={disabled}>
                {t('common.save')}
              </Button>
            </div>
          </div>
        </Card>

        <Card title={t('codex_inspection.cooldowns_title')} className={styles.cooldownCard}>
          <div className={styles.cooldownList}>
            {cooldowns.length === 0 && (
              <div className={styles.emptyState}>{t('codex_inspection.cooldowns_empty')}</div>
            )}
            {cooldowns.slice(0, 8).map((item) => (
              <div className={styles.cooldownItem} key={item.id}>
                <div>
                  <strong>{item.displayAccount || item.fileName}</strong>
                  <small>{item.fileName}</small>
                </div>
                <div className={styles.cooldownMeta}>
                  <span className={`${styles.statusPill} ${statusClass(item.status)}`}>
                    {t(cooldownStatusLabelKey(item.status))}
                  </span>
                  <small>{formatTime(item.restoreAtMs)}</small>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className={styles.contentGrid}>
        <Card title={t('codex_inspection.runs_title')} className={styles.runsCard}>
          <div className={styles.runList}>
            {runs.length === 0 && (
              <div className={styles.emptyState}>{t('codex_inspection.runs_empty')}</div>
            )}
            {runs.map((run) => (
              <button
                key={run.id}
                type="button"
                className={`${styles.runItem} ${run.id === currentRun?.id ? styles.runItemActive : ''}`}
                onClick={() => handleSelectRun(run)}
              >
                <span>
                  <strong>#{run.id}</strong>
                  <small>{formatTime(run.startedAtMs || run.createdAtMs)}</small>
                </span>
                <span className={`${styles.statusPill} ${statusClass(run.status)}`}>
                  {t(statusLabelKey(run.status))}
                </span>
              </button>
            ))}
          </div>
        </Card>

        <Card
          title={t('codex_inspection.results_title')}
          className={styles.resultsCard}
          extra={
            <div className={styles.resultActions}>
              <Button
                variant="secondary"
                size="sm"
                onClick={toggleSelectAllActionable}
                disabled={actionableFilteredResults.length === 0}
              >
                {t('codex_inspection.select_actionable')}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleExecuteSelected}
                loading={acting}
                disabled={selectedActionableIds.length === 0 || disabled}
              >
                {t('codex_inspection.execute_selected', { count: selectedActionableIds.length })}
              </Button>
            </div>
          }
        >
          <div className={styles.filterBar}>
            {ACTION_FILTERS.map((item) => (
              <button
                type="button"
                key={item}
                className={`${styles.filterButton} ${filter === item ? styles.filterButtonActive : ''}`}
                onClick={() => setFilter(item)}
              >
                {t(`codex_inspection.filter.${item}`)}
                <span>{filterCounts[item] || 0}</span>
              </button>
            ))}
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.resultTable}>
              <thead>
                <tr>
                  <th>{t('codex_inspection.table_select')}</th>
                  <th>{t('codex_inspection.table_account')}</th>
                  <th>{t('codex_inspection.table_action')}</th>
                  <th>{t('codex_inspection.table_usage')}</th>
                  <th>{t('codex_inspection.table_reason')}</th>
                  <th>{t('codex_inspection.table_status')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredResults.map((result) => (
                  <tr key={result.id}>
                    <td>
                      {isActionable(result) && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(result.id)}
                          onChange={() => toggleSelected(result.id)}
                          aria-label={result.displayAccount || result.fileName}
                        />
                      )}
                    </td>
                    <td>
                      <strong>{result.displayAccount || result.fileName}</strong>
                      <small>{result.fileName}</small>
                    </td>
                    <td>
                      <span className={styles.actionText}>{t(actionLabelKey(result.action))}</span>
                    </td>
                    <td>
                      <strong>{formatPercent(result.usedPercent)}</strong>
                      <small>
                        {(result.quotaWindows || [])
                          .map((window) => `${formatPercent(window.usedPercent)} ${window.resetLabel || ''}`)
                          .join(' / ') || '-'}
                      </small>
                    </td>
                    <td>{result.actionReason || result.errorDetail || '-'}</td>
                    <td>
                      <span className={`${styles.statusPill} ${statusClass(result.actionStatus)}`}>
                        {t(statusLabelKey(result.actionStatus || 'pending'))}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredResults.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <div className={styles.emptyState}>{t('codex_inspection.results_empty')}</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card title={t('codex_inspection.logs_title')} className={styles.logsCard}>
        <div className={styles.logList}>
          {(detail?.logs || []).length === 0 && (
            <div className={styles.emptyState}>{t('codex_inspection.logs_empty')}</div>
          )}
          {(detail?.logs || []).slice(-80).map((entry) => (
            <div className={styles.logItem} key={entry.id}>
              <span className={`${styles.statusPill} ${statusClass(entry.level)}`}>{entry.level}</span>
              <strong>{entry.message}</strong>
              <small>{formatTime(entry.createdAtMs)}</small>
            </div>
          ))}
        </div>
      </Card>

      {loading && <div className={styles.loadingMask}>{t('common.loading')}</div>}
    </div>
  );
}
