import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { ParsedAuthFileBatchWorkbook } from '@/features/authFiles/bulkMaintenance';
import type { AuthFileBatchImportTaskResult } from '@/services/api/authFiles';
import styles from '@/pages/AuthFilesPage.module.scss';

export type AuthFilesBulkMaintenanceModalProps = {
  open: boolean;
  disableControls: boolean;
  selectedCount: number;
  filteredCount: number;
  busyAction: 'selected' | 'filtered' | 'import' | null;
  importFileName: string;
  importPreview: ParsedAuthFileBatchWorkbook | null;
  importTask: AuthFileBatchImportTaskResult | null;
  importError: string;
  onClose: () => void;
  onExportSelected: () => void;
  onExportFiltered: () => void;
  onPickImportFile: () => void;
  onImport: () => void;
  onResetImport: () => void;
};

export function AuthFilesBulkMaintenanceModal(props: AuthFilesBulkMaintenanceModalProps) {
  const { t } = useTranslation();
  const {
    open,
    disableControls,
    selectedCount,
    filteredCount,
    busyAction,
    importFileName,
    importPreview,
    importTask,
    importError,
    onClose,
    onExportSelected,
    onExportFiltered,
    onPickImportFile,
    onImport,
    onResetImport,
  } = props;

  const invalidPreviewCount = useMemo(
    () => importPreview?.previewRows.filter((row) => row.errors.length > 0).length ?? 0,
    [importPreview]
  );
  const canImport =
    disableControls !== true &&
    busyAction !== 'import' &&
    Boolean(importPreview) &&
    (importPreview?.rows.length ?? 0) > 0 &&
    (importPreview?.errors.length ?? 0) === 0;
  const progressPercent = useMemo(() => {
    if (!importTask) {
      return 0;
    }
    if (importTask.totalRows <= 0) {
      return importTask.status === 'completed' ? 100 : 0;
    }
    return Math.max(
      0,
      Math.min(100, Math.round((importTask.processedRows / importTask.totalRows) * 100))
    );
  }, [importTask]);
  const taskStatusLabel = importTask
    ? t(`auth_files.bulk_import_status_${importTask.status}`)
    : '';

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeDisabled={busyAction !== null}
      width={920}
      title={t('auth_files.bulk_modal_title')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busyAction !== null}>
            {t('common.close')}
          </Button>
          <Button
            onClick={onImport}
            loading={busyAction === 'import'}
            disabled={!canImport}
          >
            {t('auth_files.bulk_import_apply', {
              count: importPreview?.rows.length ?? 0,
            })}
          </Button>
        </>
      }
    >
      <div className={styles.bulkModalBody}>
        <div className={styles.bulkPanelGrid}>
          <section className={styles.bulkPanel}>
            <div className={styles.bulkPanelHeader}>
              <h3>{t('auth_files.bulk_export_title')}</h3>
              <p>{t('auth_files.bulk_export_hint')}</p>
            </div>
            <div className={styles.bulkButtonGroup}>
              <Button
                variant="secondary"
                onClick={onExportSelected}
                loading={busyAction === 'selected'}
                disabled={disableControls || selectedCount === 0 || busyAction !== null}
              >
                {t('auth_files.bulk_export_selected', { count: selectedCount })}
              </Button>
              <Button
                variant="secondary"
                onClick={onExportFiltered}
                loading={busyAction === 'filtered'}
                disabled={disableControls || filteredCount === 0 || busyAction !== null}
              >
                {t('auth_files.bulk_export_filtered', { count: filteredCount })}
              </Button>
            </div>
            <div className={styles.bulkRuleList}>
              <div>{t('auth_files.bulk_rule_name_required')}</div>
              <div>{t('auth_files.bulk_rule_delete_column')}</div>
              <div>{t('auth_files.bulk_rule_blank_clear')}</div>
              <div>{t('auth_files.bulk_rule_info_ignore')}</div>
            </div>
          </section>

          <section className={styles.bulkPanel}>
            <div className={styles.bulkPanelHeader}>
              <h3>{t('auth_files.bulk_import_title')}</h3>
              <p>{t('auth_files.bulk_import_hint')}</p>
            </div>
            <div className={styles.bulkButtonGroup}>
              <Button
                onClick={onPickImportFile}
                disabled={disableControls || busyAction !== null}
              >
                {t('auth_files.bulk_import_pick_file')}
              </Button>
              <Button
                variant="ghost"
                onClick={onResetImport}
                disabled={busyAction === 'import' || (!importPreview && !importFileName && !importTask)}
              >
                {t('auth_files.bulk_import_reset')}
              </Button>
            </div>
            {importFileName && (
              <div className={styles.bulkFileName}>
                {t('auth_files.bulk_import_file_name', { name: importFileName })}
              </div>
            )}
            {importError && <div className={styles.errorBox}>{importError}</div>}
            {importTask && (
              <div className={styles.bulkTaskPanel}>
                <div className={styles.bulkTaskHeader}>
                  <div>
                    <h4>{t('auth_files.bulk_import_progress_title')}</h4>
                    <p>{t('auth_files.bulk_import_progress_hint')}</p>
                  </div>
                  <span
                    className={`${styles.bulkPreviewBadge} ${
                      importTask.status === 'failed'
                        ? styles.bulkPreviewBadgeDanger
                        : importTask.status === 'completed'
                          ? styles.bulkPreviewBadgeSuccess
                          : styles.bulkPreviewBadgeRunning
                    }`}
                  >
                    {taskStatusLabel}
                  </span>
                </div>
                <div className={styles.bulkTaskProgressMeta}>
                  <span>
                    {t('auth_files.bulk_import_progress_processed', {
                      processed: importTask.processedRows,
                      total: importTask.totalRows,
                    })}
                  </span>
                  <span>{progressPercent}%</span>
                </div>
                <div className={styles.bulkTaskProgressTrack}>
                  <div
                    className={styles.bulkTaskProgressBar}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div className={styles.bulkTaskSummary}>
                  <div className={styles.bulkSummaryCard}>
                    <span>{t('auth_files.bulk_import_progress_updated')}</span>
                    <strong>{importTask.updated}</strong>
                  </div>
                  <div className={styles.bulkSummaryCard}>
                    <span>{t('auth_files.bulk_import_progress_skipped')}</span>
                    <strong>{importTask.skipped}</strong>
                  </div>
                  <div className={styles.bulkSummaryCard}>
                    <span>{t('auth_files.bulk_import_progress_failed')}</span>
                    <strong>{importTask.failed}</strong>
                  </div>
                </div>
                {importTask.currentFile && (
                  <div className={styles.bulkTaskCurrentFile}>
                    {t('auth_files.bulk_import_progress_current_file', {
                      name: importTask.currentFile,
                    })}
                  </div>
                )}
                {importTask.failures.length > 0 && (
                  <div className={styles.bulkTaskFailures}>
                    {importTask.failures.slice(0, 5).map((failure) => (
                      <div key={`${failure.name}-${failure.error}`}>
                        {failure.name}: {failure.error}
                      </div>
                    ))}
                    {importTask.failures.length > 5 && (
                      <div>
                        {t('auth_files.bulk_import_failure_overflow', {
                          count: importTask.failures.length - 5,
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            {importPreview && (
              <div className={styles.bulkPreviewSummary}>
                <div className={styles.bulkSummaryCard}>
                  <span>{t('auth_files.bulk_preview_total_rows')}</span>
                  <strong>{importPreview.previewRows.length}</strong>
                </div>
                <div className={styles.bulkSummaryCard}>
                  <span>{t('auth_files.bulk_preview_valid_rows')}</span>
                  <strong>{importPreview.rows.length}</strong>
                </div>
                <div className={styles.bulkSummaryCard}>
                  <span>{t('auth_files.bulk_preview_invalid_rows')}</span>
                  <strong>{invalidPreviewCount}</strong>
                </div>
              </div>
            )}
          </section>
        </div>

        {importPreview && importPreview.previewRows.length > 0 && (
          <section className={styles.bulkPreviewPanel}>
            <div className={styles.bulkPreviewHeader}>
              <h3>{t('auth_files.bulk_preview_title')}</h3>
              <p>{t('auth_files.bulk_preview_hint')}</p>
            </div>
            <div className={styles.bulkPreviewList}>
              {importPreview.previewRows.slice(0, 20).map((row) => (
                <article key={`${row.rowNumber}-${row.name}`} className={styles.bulkPreviewRow}>
                  <div className={styles.bulkPreviewRowHeader}>
                    <div className={styles.bulkPreviewRowTitle}>
                      <strong>{row.name || t('auth_files.bulk_preview_unnamed')}</strong>
                      <span>{t('auth_files.bulk_preview_row_number', { row: row.rowNumber })}</span>
                    </div>
                    <span
                      className={`${styles.bulkPreviewBadge} ${
                        row.errors.length > 0
                          ? styles.bulkPreviewBadgeDanger
                          : styles.bulkPreviewBadgeSuccess
                      }`}
                    >
                      {row.errors.length > 0
                        ? t('common.error')
                        : t('auth_files.bulk_preview_ready')}
                    </span>
                  </div>
                  <div className={styles.bulkPreviewMeta}>
                    <span>{t('auth_files.bulk_preview_set_count', { count: row.setCount })}</span>
                    <span>{t('auth_files.bulk_preview_clear_count', { count: row.clearCount })}</span>
                    {row.expectedProvider && (
                      <span>
                        {t('auth_files.bulk_preview_provider', { provider: row.expectedProvider })}
                      </span>
                    )}
                    {row.expectedType && (
                      <span>{t('auth_files.bulk_preview_type', { type: row.expectedType })}</span>
                    )}
                  </div>
                  <div className={styles.bulkPreviewFields}>
                    {row.fields.map((field) => (
                      <span key={`${row.rowNumber}-${field}`} className={styles.bulkPreviewFieldTag}>
                        {field}
                      </span>
                    ))}
                  </div>
                  {row.errors.length > 0 && (
                    <div className={styles.bulkPreviewErrors}>
                      {row.errors.map((error) => (
                        <div key={`${row.rowNumber}-${error}`}>{error}</div>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
            {importPreview.previewRows.length > 20 && (
              <div className={styles.bulkPreviewOverflow}>
                {t('auth_files.bulk_preview_overflow', {
                  count: importPreview.previewRows.length - 20,
                })}
              </div>
            )}
          </section>
        )}
      </div>
    </Modal>
  );
}
