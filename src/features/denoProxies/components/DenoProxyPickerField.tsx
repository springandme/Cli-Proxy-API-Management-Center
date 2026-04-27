import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AutocompleteInput } from '@/components/ui/AutocompleteInput';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { denoProxiesApi } from '@/services/api/denoProxies';
import { useNotificationStore } from '@/stores';
import type { DenoProxyListResponse } from '@/types';
import {
  denoProxyProbeLooksHealthy,
  normalizeDenoProxyHostForMatch,
} from '@/features/denoProxies/utils';
import styles from './DenoProxyPickerField.module.scss';

type DenoProxyPickerFieldProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label: string;
  hint?: string;
};

type DenoProxySortMode = 'usage-desc' | 'usage-asc' | 'host-asc' | 'host-desc';

export function DenoProxyPickerField({
  value,
  onChange,
  disabled,
  label,
  hint,
}: DenoProxyPickerFieldProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const [data, setData] = useState<DenoProxyListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sortMode, setSortMode] = useState<DenoProxySortMode>('usage-asc');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    denoProxiesApi
      .list()
      .then((result) => {
        if (cancelled) return;
        setData(result);
      })
      .catch(() => {
        if (cancelled) return;
        setData(null);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const sortOptions = useMemo(
    () => [
      {
        value: 'usage-desc',
        label: t('deno_proxies.picker_sort_usage_desc'),
      },
      {
        value: 'usage-asc',
        label: t('deno_proxies.picker_sort_usage_asc'),
      },
      {
        value: 'host-asc',
        label: t('deno_proxies.picker_sort_host_asc'),
      },
      {
        value: 'host-desc',
        label: t('deno_proxies.picker_sort_host_desc'),
      },
    ],
    [t]
  );

  const sortedItems = useMemo(() => {
    const items = [...(data?.items ?? [])];
    items.sort((left, right) => {
      if (sortMode === 'usage-desc') {
        if (right.usage_count !== left.usage_count) {
          return right.usage_count - left.usage_count;
        }
        return left.host.localeCompare(right.host);
      }
      if (sortMode === 'usage-asc') {
        if (left.usage_count !== right.usage_count) {
          return left.usage_count - right.usage_count;
        }
        return left.host.localeCompare(right.host);
      }
      if (sortMode === 'host-desc') {
        return right.host.localeCompare(left.host);
      }
      return left.host.localeCompare(right.host);
    });
    return items;
  }, [data?.items, sortMode]);

  const options = useMemo(
    () =>
      sortedItems.map((item) => ({
        value: item.host,
        label:
          item.usage_count > 0
            ? t('deno_proxies.option_in_use', { count: item.usage_count })
            : t('deno_proxies.option_unused'),
      })),
    [sortedItems, t]
  );

  const normalizedValue = normalizeDenoProxyHostForMatch(value);
  const matchingItem = useMemo(
    () =>
      normalizedValue
        ? (data?.items ?? []).find((item) => item.host === normalizedValue)
        : undefined,
    [data?.items, normalizedValue]
  );

  const handleTest = async () => {
    const candidate = value.trim();
    if (!candidate) {
      showNotification(t('deno_proxies.empty_host'), 'error');
      return;
    }

    setTesting(true);
    try {
      const result = await denoProxiesApi.probe(candidate);
      showNotification(result.summary, denoProxyProbeLooksHealthy(result) ? 'success' : 'error');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('notification.update_failed');
      showNotification(message, 'error');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className={styles.pickerField}>
      <AutocompleteInput
        label={label}
        value={value}
        onChange={onChange}
        options={options}
        disabled={disabled}
        hint={hint}
        placeholder={t('deno_proxies.host_placeholder')}
        dropdownInFlow
      />
      <div className={styles.fieldToolbar}>
        <div className={styles.fieldToolbarLeft}>
          <Select
            value={sortMode}
            options={sortOptions}
            onChange={(value) => setSortMode(value as DenoProxySortMode)}
            ariaLabel={t('deno_proxies.picker_sort_label')}
            className={styles.sortSelect}
          />
          {matchingItem ? (
            <span className={styles.meta}>
              {matchingItem.usage_count > 0
                ? t('deno_proxies.picker_in_use', { count: matchingItem.usage_count })
                : t('deno_proxies.picker_unused')}
            </span>
          ) : normalizedValue ? (
            <span className={styles.meta}>{t('deno_proxies.picker_custom')}</span>
          ) : null}
        </div>
        <div className={styles.fieldToolbarRight}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void handleTest();
            }}
            disabled={disabled || testing || loading}
            loading={testing}
          >
            {t('common.test')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const candidate = normalizeDenoProxyHostForMatch(value) || value.trim();
              navigate(
                {
                  pathname: '/auth-files/deno-proxies',
                  search: candidate ? `?search=${encodeURIComponent(candidate)}` : '',
                },
                { state: { fromAuthFiles: true } }
              );
            }}
          >
            {t('common.manage')}
          </Button>
        </div>
      </div>
    </div>
  );
}
