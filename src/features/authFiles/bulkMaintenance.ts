import * as XLSX from 'xlsx';
import type {
  AuthFileBatchExportResult,
  AuthFileBatchImportFieldAction,
  AuthFileBatchImportRow,
} from '@/services/api/authFiles';

export const AUTH_FILE_BATCH_SHEET_NAME = 'auth-files';
export const AUTH_FILE_BATCH_README_SHEET_NAME = 'README';
export const AUTH_FILE_BATCH_INFO_PREFIX = 'info_';
export const AUTH_FILE_BATCH_REQUIRED_COLUMN = 'name';

export type AuthFileBatchImportPreviewRow = {
  rowNumber: number;
  name: string;
  expectedProvider: string;
  expectedType: string;
  setCount: number;
  clearCount: number;
  fields: string[];
  errors: string[];
};

export type ParsedAuthFileBatchWorkbook = {
  headers: string[];
  editableColumns: string[];
  readonlyColumns: string[];
  rows: AuthFileBatchImportRow[];
  previewRows: AuthFileBatchImportPreviewRow[];
  errors: string[];
};

export const buildAuthFilesBatchWorkbookFilename = (date = new Date()) => {
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(
    date.getHours()
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `auth-files-batch-${stamp}.xlsx`;
};

export const buildAuthFilesBatchWorkbookBlob = (
  payload: AuthFileBatchExportResult
): Blob => {
  const editableColumns = payload.editableColumns.filter(
    (column) => column !== AUTH_FILE_BATCH_REQUIRED_COLUMN
  );
  const columns = [
    AUTH_FILE_BATCH_REQUIRED_COLUMN,
    ...editableColumns,
    ...payload.readonlyColumns.filter((column) => column !== AUTH_FILE_BATCH_REQUIRED_COLUMN),
  ];

  const rows = payload.rows.map((row) => {
    const normalized: Record<string, unknown> = {};
    columns.forEach((column) => {
      normalized[column] = serializeWorkbookCellValue(row[column]);
    });
    return normalized;
  });

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows, {
    header: columns,
    skipHeader: false,
  });
  sheet['!cols'] = columns.map((column) => ({
    wch: Math.max(column.length + 2, suggestColumnWidth(column)),
  }));

  XLSX.utils.book_append_sheet(workbook, sheet, AUTH_FILE_BATCH_SHEET_NAME);

  const readmeSheet = XLSX.utils.aoa_to_sheet([
    ['CLI Proxy API Auth Files Batch Maintenance'],
    [''],
    ['Rules'],
    ['1. The "name" column is required.'],
    ['2. Delete a whole editable column if you want to skip updating that field.'],
    ['3. Keep the column but leave a cell blank if you want to clear that field.'],
    ['4. Columns starting with "info_" are export-only and will be ignored during import.'],
    ['5. Arrays and objects are exported as JSON text. Keep the JSON valid when editing.'],
    ['6. Example: remove the "proxy_url" column to skip it; keep it and leave a cell blank to clear it.'],
    [''],
    ['技术说明'],
    ['1. name 列必填。'],
    ['2. 想跳过某字段，请直接删除整列。'],
    ['3. 保留列但单元格留空，表示清空该字段。'],
    ['4. 所有 info_ 前缀列仅用于辅助识别，导入时会自动忽略。'],
    ['5. 数组和对象会以 JSON 文本导出，编辑后请保持 JSON 合法。'],
  ]);
  readmeSheet['!cols'] = [{ wch: 96 }];
  XLSX.utils.book_append_sheet(workbook, readmeSheet, AUTH_FILE_BATCH_README_SHEET_NAME);

  const arrayBuffer = XLSX.write(workbook, {
    type: 'array',
    bookType: 'xlsx',
  });
  return new Blob([arrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
};

export const parseAuthFilesBatchWorkbook = async (
  file: File
): Promise<ParsedAuthFileBatchWorkbook> => {
  const workbook = XLSX.read(await file.arrayBuffer(), {
    type: 'array',
    raw: true,
  });
  const targetSheetName =
    workbook.SheetNames.find(
      (name) => name.trim().toLowerCase() !== AUTH_FILE_BATCH_README_SHEET_NAME.toLowerCase()
    ) ?? workbook.SheetNames[0];

  if (!targetSheetName) {
    return {
      headers: [],
      editableColumns: [],
      readonlyColumns: [],
      rows: [],
      previewRows: [],
      errors: ['Workbook does not contain any sheet.'],
    };
  }

  const worksheet = workbook.Sheets[targetSheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    raw: true,
    defval: null,
  });
  const headerRow = Array.isArray(matrix[0]) ? matrix[0] : [];
  const headers = dedupeHeaders(
    headerRow.map((cell) => String(cell ?? '').trim()).filter(Boolean)
  );

  const errors: string[] = [];
  if (!headers.includes(AUTH_FILE_BATCH_REQUIRED_COLUMN)) {
    errors.push(`Missing required column: ${AUTH_FILE_BATCH_REQUIRED_COLUMN}`);
  }

  const readonlyColumns = headers.filter((header) =>
    header.toLowerCase().startsWith(AUTH_FILE_BATCH_INFO_PREFIX)
  );
  const editableColumns = headers.filter(
    (header) =>
      header !== AUTH_FILE_BATCH_REQUIRED_COLUMN &&
      !header.toLowerCase().startsWith(AUTH_FILE_BATCH_INFO_PREFIX)
  );
  if (editableColumns.length === 0) {
    errors.push('No editable columns found. Delete fewer columns before importing.');
  }

  const rowObjects = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    raw: true,
    defval: null,
  });

  const seenNames = new Set<string>();
  const rows: AuthFileBatchImportRow[] = [];
  const previewRows: AuthFileBatchImportPreviewRow[] = [];

  rowObjects.forEach((row, index) => {
    const rowNumber = index + 2;
    if (!rowHasAnyValue(row, headers)) {
      return;
    }

    const rowErrors: string[] = [];
    const name = String(row[AUTH_FILE_BATCH_REQUIRED_COLUMN] ?? '').trim();
    if (!name) {
      rowErrors.push(`Row ${rowNumber}: missing required name.`);
    } else if (seenNames.has(name)) {
      rowErrors.push(`Row ${rowNumber}: duplicate name "${name}".`);
    } else {
      seenNames.add(name);
    }

    const fields: Record<string, AuthFileBatchImportFieldAction> = {};
    let setCount = 0;
    let clearCount = 0;

    editableColumns.forEach((column) => {
      try {
        const action = parseWorkbookImportCell(row[column]);
        fields[column] = action;
        if (action.op === 'set') {
          setCount += 1;
        } else {
          clearCount += 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        rowErrors.push(`Row ${rowNumber} column "${column}": ${message}`);
      }
    });

    const expectedProvider = String(row[`${AUTH_FILE_BATCH_INFO_PREFIX}provider`] ?? '')
      .trim()
      .toLowerCase();
    const expectedType = String(row[`${AUTH_FILE_BATCH_INFO_PREFIX}type`] ?? '')
      .trim()
      .toLowerCase();

    previewRows.push({
      rowNumber,
      name,
      expectedProvider,
      expectedType,
      setCount,
      clearCount,
      fields: editableColumns,
      errors: rowErrors,
    });

    if (rowErrors.length > 0 || !name) {
      return;
    }

    rows.push({
      name,
      expected_provider: expectedProvider || undefined,
      expected_type: expectedType || undefined,
      fields,
    });
  });

  return {
    headers,
    editableColumns,
    readonlyColumns,
    rows,
    previewRows,
    errors,
  };
};

const dedupeHeaders = (headers: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  headers.forEach((header) => {
    if (!header || seen.has(header)) return;
    seen.add(header);
    result.push(header);
  });
  return result;
};

const rowHasAnyValue = (row: Record<string, unknown>, headers: string[]): boolean =>
  headers.some((header) => hasCellValue(row[header]));

const hasCellValue = (value: unknown): boolean => {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
};

const parseWorkbookImportCell = (value: unknown): AuthFileBatchImportFieldAction => {
  if (value == null) {
    return { op: 'clear' };
  }
  if (typeof value === 'string') {
    if (value.trim() === '') {
      return { op: 'clear' };
    }
    const trimmed = value.trim();
    if (trimmed === 'null') {
      return { op: 'set', value: null };
    }
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return { op: 'set', value: JSON.parse(trimmed) as unknown };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'invalid JSON value';
        throw new Error(message);
      }
    }
    return { op: 'set', value };
  }
  if (value instanceof Date) {
    return { op: 'set', value: value.toISOString() };
  }
  return { op: 'set', value };
};

const serializeWorkbookCellValue = (value: unknown): string | number | boolean => {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return JSON.stringify(value);
};

const suggestColumnWidth = (column: string): number => {
  if (column === AUTH_FILE_BATCH_REQUIRED_COLUMN) return 28;
  if (column.startsWith(AUTH_FILE_BATCH_INFO_PREFIX)) return 24;
  if (column.includes('token') || column.includes('cookie')) return 36;
  if (column.includes('proxy') || column.includes('host')) return 32;
  return 20;
};
