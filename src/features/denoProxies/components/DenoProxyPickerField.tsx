import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AutocompleteInput } from '@/components/ui/AutocompleteInput';
import { Button } from '@/components/ui/Button';
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

  const options = useMemo(
    () =>
      (data?.items ?? []).map((item) => ({
        value: item.host,
        label:
          item.usage_count > 0
            ? t('deno_proxies.option_in_use', { count: item.usage_count })
            : t('deno_proxies.option_unused'),
      })),
    [data?.items, t]
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
    <div>
      <AutocompleteInput
        label={label}
        value={value}
        onChange={onChange}
        options={options}
        disabled={disabled}
        hint={hint}
        placeholder={t('deno_proxies.host_placeholder')}
      />
      <div className={styles.actions}>
        <Button
          variant="secondary"
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
          variant="secondary"
          size="sm"
          onClick={() => navigate('/auth-files/deno-proxies', { state: { fromAuthFiles: true } })}
        >
          {t('common.manage')}
        </Button>
      </div>
      {matchingItem ? (
        <div className={styles.meta}>
          {matchingItem.usage_count > 0
            ? t('deno_proxies.picker_in_use', { count: matchingItem.usage_count })
            : t('deno_proxies.picker_unused')}
        </div>
      ) : normalizedValue ? (
        <div className={styles.meta}>{t('deno_proxies.picker_custom')}</div>
      ) : null}
    </div>
  );
}
