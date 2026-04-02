import ExcelJS from 'exceljs';
import type {
  AuthFileBatchExportResult,
  AuthFileBatchImportFieldAction,
  AuthFileBatchImportRow,
} from '@/services/api/authFiles';

export const AUTH_FILE_BATCH_SHEET_NAME = 'auth-files';
export const AUTH_FILE_BATCH_README_SHEET_NAME = 'README';
export const AUTH_FILE_BATCH_OPTIONS_SHEET_NAME = 'options';
export const AUTH_FILE_BATCH_INFO_PREFIX = 'info_';
export const AUTH_FILE_BATCH_REQUIRED_COLUMN = 'name';
const AUTH_FILE_BATCH_PRIORITY_COLUMNS = [
  AUTH_FILE_BATCH_REQUIRED_COLUMN,
  'info_plan_type',
] as const;

const AUTH_FILE_BATCH_FONT_NAME = 'Consolas';
const AUTH_FILE_BATCH_HEADER_FILL = 'FF8DB4E2';
const BOOLEAN_FIELD_OPTIONS = ['true', 'false'] as const;
const BOOLEAN_FIELDS = new Set(['disabled', 'disable_cooling', 'websockets']);
const INTEGER_FIELDS = new Set(['priority']);
const DELIMITED_STRING_ARRAY_FIELDS = new Set(['excluded_models']);

const COLUMN_LABELS: Record<string, string> = {
  name: '文件名',
  disabled: '是否禁用',
  label: '显示名称',
  email: '邮箱',
  prefix: '转发前缀',
  proxy_url: '代理地址',
  priority: '优先级',
  note: '备注',
  excluded_models: '排除模型',
  disable_cooling: '禁用冷却',
  deno_proxy_host: 'Deno 转发地址',
  websockets: 'WebSocket',
  access_token: '访问令牌',
  refresh_token: '刷新令牌',
  id_token: 'ID 令牌',
  expired: '过期时间',
  account_id: '账号 ID',
  last_refresh: '最近刷新',
  token: '令牌对象',
  info_provider: 'Provider',
  info_type: '类型',
  info_email: '识别邮箱',
  info_status: '运行状态',
  info_status_message: '状态信息',
  info_disabled: '运行态禁用',
  info_runtime_only: '仅运行态',
  info_unavailable: '不可用',
  info_size: '文件大小',
  info_modified: '修改时间',
  info_last_refresh: '运行态刷新时间',
  info_account_type: '账号类型',
  info_account: '账号',
  info_plan_type: '套餐',
  info_chatgpt_account_id: 'ChatGPT 账号 ID',
  info_json_keys: 'JSON 键列表',
};

const COLUMN_DESCRIPTIONS: Record<string, string> = {
  name: '必填。用于定位目标 auth 文件，导入时不会修改文件名。',
  disabled: '布尔值。true=禁用，false=启用。支持下拉。',
  label: '自定义显示名称。留空表示清空。',
  email: '邮箱字段。通常用于识别账户。',
  prefix: '代理前缀。留空表示清空。',
  proxy_url: '上游代理 URL，例如 socks5://127.0.0.1:1080。',
  priority: '整数。值越大优先级越高。',
  note: '备注信息。',
  excluded_models: '数组字段。可填 JSON 数组，或逗号/换行分隔列表。',
  disable_cooling: '布尔值。支持下拉。',
  deno_proxy_host: 'Codex Deno relay 地址，例如 https://your-project.deno.dev。',
  websockets: '布尔值。支持下拉。',
  access_token: '认证字段。通常为字符串。',
  refresh_token: '认证字段。通常为字符串。',
  id_token: '认证字段。通常为 JWT 字符串。',
  expired: '过期时间。可填 ISO 时间字符串。',
  account_id: '账号标识。',
  last_refresh: '最近刷新时间。可填 ISO 时间字符串。',
  token: '对象字段。请填写合法 JSON。',
  info_provider: '只读辅助字段，导入时忽略。',
  info_type: '只读辅助字段，导入时忽略。',
  info_email: '只读辅助字段，导入时忽略。',
  info_status: '只读辅助字段，导入时忽略。',
  info_status_message: '只读辅助字段，导入时忽略。',
  info_disabled: '只读辅助字段，导入时忽略。',
  info_runtime_only: '只读辅助字段，导入时忽略。',
  info_unavailable: '只读辅助字段，导入时忽略。',
  info_size: '只读辅助字段，导入时忽略。',
  info_modified: '只读辅助字段，导入时忽略。',
  info_last_refresh: '只读辅助字段，导入时忽略。',
  info_account_type: '只读辅助字段，导入时忽略。',
  info_account: '只读辅助字段，导入时忽略。',
  info_plan_type: '只读辅助字段，导入时忽略。',
  info_chatgpt_account_id: '只读辅助字段，导入时忽略。',
  info_json_keys: '只读辅助字段，导入时忽略。',
};

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

export const buildAuthFilesBatchWorkbookBlob = async (
  payload: AuthFileBatchExportResult
): Promise<Blob> => {
  const editableColumns = payload.editableColumns.filter(
    (column) => column !== AUTH_FILE_BATCH_REQUIRED_COLUMN
  );
  const columns = orderWorkbookColumns(editableColumns, payload.readonlyColumns);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CLI Proxy API Management Center';
  workbook.created = new Date();
  workbook.modified = new Date();

  const readmeSheet = workbook.addWorksheet(AUTH_FILE_BATCH_README_SHEET_NAME);
  buildReadmeSheet(readmeSheet, editableColumns, payload.readonlyColumns);

  const authSheet = workbook.addWorksheet(AUTH_FILE_BATCH_SHEET_NAME);
  buildAuthFilesSheet(authSheet, columns, payload.rows);

  const optionsSheet = workbook.addWorksheet(AUTH_FILE_BATCH_OPTIONS_SHEET_NAME);
  buildOptionsSheet(optionsSheet);
  optionsSheet.state = 'hidden';
  applyColumnValidations(authSheet, columns, payload.rows.length);

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return new Blob([arrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
};

export const parseAuthFilesBatchWorkbook = async (
  file: File
): Promise<ParsedAuthFileBatchWorkbook> => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

  const worksheet =
    workbook.getWorksheet(AUTH_FILE_BATCH_SHEET_NAME) ??
    workbook.worksheets.find(
      (sheet) =>
        sheet.name.trim().toLowerCase() !== AUTH_FILE_BATCH_README_SHEET_NAME.toLowerCase() &&
        sheet.name.trim().toLowerCase() !== AUTH_FILE_BATCH_OPTIONS_SHEET_NAME.toLowerCase()
    );

  if (!worksheet) {
    return {
      headers: [],
      editableColumns: [],
      readonlyColumns: [],
      rows: [],
      previewRows: [],
      errors: ['Workbook does not contain any sheet.'],
    };
  }

  const headerValues = worksheet.getRow(1).values;
  const rawHeaderValues = (Array.isArray(headerValues) ? headerValues.slice(1) : []).map((value) =>
    String(readWorkbookCellValue(value) ?? '').trim()
  );
  const headers = dedupeHeaders(rawHeaderValues.map(normalizeWorkbookHeader).filter(Boolean));

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

  const seenNames = new Set<string>();
  const rows: AuthFileBatchImportRow[] = [];
  const previewRows: AuthFileBatchImportPreviewRow[] = [];

  for (let index = 2; index <= worksheet.rowCount; index += 1) {
    const row = worksheet.getRow(index);
    const rowMap: Record<string, unknown> = {};
    headers.forEach((header, columnIndex) => {
      rowMap[header] = readWorkbookCellValue(row.getCell(columnIndex + 1).value);
    });
    if (!rowHasAnyValue(rowMap, headers)) {
      continue;
    }

    const rowErrors: string[] = [];
    const name = String(rowMap[AUTH_FILE_BATCH_REQUIRED_COLUMN] ?? '').trim();
    if (!name) {
      rowErrors.push(`Row ${index}: missing required name.`);
    } else if (seenNames.has(name)) {
      rowErrors.push(`Row ${index}: duplicate name "${name}".`);
    } else {
      seenNames.add(name);
    }

    const fields: Record<string, AuthFileBatchImportFieldAction> = {};
    let setCount = 0;
    let clearCount = 0;

    editableColumns.forEach((column) => {
      try {
        const action = parseWorkbookImportCell(column, rowMap[column]);
        fields[column] = action;
        if (action.op === 'set') {
          setCount += 1;
        } else {
          clearCount += 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        rowErrors.push(`Row ${index} column "${column}": ${message}`);
      }
    });

    const expectedProvider = String(rowMap[`${AUTH_FILE_BATCH_INFO_PREFIX}provider`] ?? '')
      .trim()
      .toLowerCase();
    const expectedType = String(rowMap[`${AUTH_FILE_BATCH_INFO_PREFIX}type`] ?? '')
      .trim()
      .toLowerCase();

    previewRows.push({
      rowNumber: index,
      name,
      expectedProvider,
      expectedType,
      setCount,
      clearCount,
      fields: editableColumns,
      errors: rowErrors,
    });

    if (rowErrors.length > 0 || !name) {
      continue;
    }

    rows.push({
      name,
      expected_provider: expectedProvider || undefined,
      expected_type: expectedType || undefined,
      fields,
    });
  }

  return {
    headers,
    editableColumns,
    readonlyColumns,
    rows,
    previewRows,
    errors,
  };
};

function buildReadmeSheet(
  worksheet: ExcelJS.Worksheet,
  editableColumns: string[],
  readonlyColumns: string[]
) {
  const rows: Array<Array<string>> = [
    ['CLI Proxy API Auth Files Batch Maintenance'],
    [''],
    ['规则 / Rules'],
    ['1. name 列必填，用于定位目标认证文件。'],
    ['2. 删除整列表示跳过该字段，不做更新。'],
    ['3. 保留列但单元格留空，表示清空该字段。'],
    ['4. 所有 info_ 前缀列仅用于辅助识别，导入时会自动忽略。'],
    ['5. 数组和对象建议填写合法 JSON；excluded_models 同时支持逗号 / 换行分隔。'],
    ['6. 布尔字段支持 true / false，并提供 Excel 下拉选项。'],
    [''],
    ['字段对照 / Field Guide'],
    ['显示列', '内部 key', '是否导入', '说明'],
  ];

  [...editableColumns, ...readonlyColumns].forEach((column) => {
    rows.push([
      buildWorkbookHeader(column),
      column,
      column.startsWith(AUTH_FILE_BATCH_INFO_PREFIX) ? '否' : '是',
      COLUMN_DESCRIPTIONS[column] ?? '未提供额外说明。',
    ]);
  });

  rows.forEach((row) => worksheet.addRow(row));
  worksheet.columns = [
    { width: 32 },
    { width: 28 },
    { width: 12 },
    { width: 90 },
  ];
  worksheet.views = [{ state: 'frozen', ySplit: 12 }];

  worksheet.eachRow((row, rowNumber) => {
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = {
        name: AUTH_FILE_BATCH_FONT_NAME,
        size: rowNumber === 1 ? 14 : 11,
        bold: rowNumber === 1 || rowNumber === 12,
      };
      cell.alignment = {
        vertical: 'middle',
        wrapText: true,
      };
    });
    if (rowNumber === 1 || rowNumber === 12) {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: AUTH_FILE_BATCH_HEADER_FILL },
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD9E4F5' } },
          left: { style: 'thin', color: { argb: 'FFD9E4F5' } },
          bottom: { style: 'thin', color: { argb: 'FFD9E4F5' } },
          right: { style: 'thin', color: { argb: 'FFD9E4F5' } },
        };
      });
    }
  });
}

function buildAuthFilesSheet(
  worksheet: ExcelJS.Worksheet,
  columns: string[],
  rows: Record<string, unknown>[]
) {
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };

  worksheet.addRow(columns.map((column) => buildWorkbookHeader(column)));
  rows.forEach((row) => {
    worksheet.addRow(columns.map((column) => serializeWorkbookCellValue(row[column])));
  });

  worksheet.columns = columns.map((column) => ({
    key: column,
    width: Math.max(buildWorkbookHeader(column).length + 4, suggestColumnWidth(column)),
    style: {
      font: {
        name: AUTH_FILE_BATCH_FONT_NAME,
        size: 11,
      },
      alignment: {
        vertical: 'middle',
        horizontal: 'left',
        wrapText: false,
      },
    },
  }));

  const headerRow = worksheet.getRow(1);
  headerRow.height = 24;
  headerRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = {
      name: AUTH_FILE_BATCH_FONT_NAME,
      size: 11,
      bold: true,
    };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: AUTH_FILE_BATCH_HEADER_FILL },
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFD9E4F5' } },
      left: { style: 'thin', color: { argb: 'FFD9E4F5' } },
      bottom: { style: 'thin', color: { argb: 'FFD9E4F5' } },
      right: { style: 'thin', color: { argb: 'FFD9E4F5' } },
    };
  });

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }
    row.height = 20;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = {
        name: AUTH_FILE_BATCH_FONT_NAME,
        size: 11,
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: 'left',
        wrapText: false,
      };
    });
  });
}

function orderWorkbookColumns(editableColumns: string[], readonlyColumns: string[]): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  const push = (column: string) => {
    if (!column || seen.has(column)) {
      return;
    }
    seen.add(column);
    ordered.push(column);
  };

  AUTH_FILE_BATCH_PRIORITY_COLUMNS.forEach((column) => push(column));
  editableColumns.forEach((column) => push(column));
  readonlyColumns.forEach((column) => push(column));

  return ordered;
}

function buildOptionsSheet(worksheet: ExcelJS.Worksheet) {
  worksheet.getCell('A1').value = BOOLEAN_FIELD_OPTIONS[0];
  worksheet.getCell('A2').value = BOOLEAN_FIELD_OPTIONS[1];
}

function applyColumnValidations(
  worksheet: ExcelJS.Worksheet,
  columns: string[],
  rowCount: number
) {
  const maxRow = Math.max(rowCount + 200, 1000);
  columns.forEach((column, index) => {
    if (!BOOLEAN_FIELDS.has(column)) {
      return;
    }
    for (let rowIndex = 2; rowIndex <= maxRow; rowIndex += 1) {
      worksheet.getCell(rowIndex, index + 1).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`'${AUTH_FILE_BATCH_OPTIONS_SHEET_NAME}'!$A$1:$A$2`],
        showErrorMessage: true,
        errorTitle: 'Invalid option',
        error: 'Please select true or false from the dropdown.',
      };
    }
  });
}

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

const normalizeWorkbookHeader = (header: string): string => {
  const trimmed = header.trim();
  if (!trimmed) {
    return '';
  }
  if (COLUMN_LABELS[trimmed]) {
    return trimmed;
  }
  const normalizedAlias = normalizeHeaderAlias(trimmed);
  if (normalizedAlias) {
    return normalizedAlias;
  }
  const match = trimmed.match(/[（(]([^()（）]+)[)）]\s*$/);
  if (match?.[1]) {
    return match[1].trim();
  }
  return trimmed;
};

const normalizeHeaderAlias = (header: string): string => {
  const normalized = header.replace(/\s+/g, '').trim();
  const entries = Object.entries(COLUMN_LABELS);
  for (const [key, label] of entries) {
    if (label.replace(/\s+/g, '') === normalized) {
      return key;
    }
  }
  return '';
};

const parseWorkbookImportCell = (
  column: string,
  value: unknown
): AuthFileBatchImportFieldAction => {
  if (value == null) {
    return { op: 'clear' };
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return { op: 'clear' };
    }
    if (BOOLEAN_FIELDS.has(column)) {
      const parsedBoolean = parseBooleanLike(trimmed);
      if (parsedBoolean == null) {
        throw new Error('expected boolean value');
      }
      return { op: 'set', value: parsedBoolean };
    }
    if (INTEGER_FIELDS.has(column)) {
      const parsedInteger = Number.parseInt(trimmed, 10);
      if (Number.isNaN(parsedInteger)) {
        throw new Error('expected integer value');
      }
      return { op: 'set', value: parsedInteger };
    }
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
    if (DELIMITED_STRING_ARRAY_FIELDS.has(column)) {
      return { op: 'set', value: normalizeDelimitedStringArray(trimmed) };
    }
    return { op: 'set', value };
  }
  if (typeof value === 'boolean') {
    return { op: 'set', value };
  }
  if (typeof value === 'number') {
    if (INTEGER_FIELDS.has(column)) {
      return { op: 'set', value: Math.trunc(value) };
    }
    return { op: 'set', value };
  }
  if (value instanceof Date) {
    return { op: 'set', value: value.toISOString() };
  }
  return { op: 'set', value };
};

const parseBooleanLike = (value: string): boolean | null => {
  switch (value.trim().toLowerCase()) {
    case 'true':
    case '1':
    case 'yes':
    case 'y':
    case 'on':
    case 'enabled':
    case 'enable':
    case '是':
    case '开启':
    case '启用':
      return true;
    case 'false':
    case '0':
    case 'no':
    case 'n':
    case 'off':
    case 'disabled':
    case 'disable':
    case '否':
    case '关闭':
    case '禁用':
      return false;
    default:
      return null;
  }
};

const normalizeDelimitedStringArray = (value: string): string[] =>
  Array.from(
    new Set(
      value
        .split(/[\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );

const readWorkbookCellValue = (value: ExcelJS.CellValue | undefined): unknown => {
  if (value == null) return null;
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value instanceof Date
  ) {
    return value;
  }
  if (typeof value === 'object') {
    if ('text' in value && typeof value.text === 'string') {
      return value.text;
    }
    if ('result' in value) {
      return readWorkbookCellValue(value.result);
    }
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((entry) => entry.text).join('');
    }
    if ('hyperlink' in value && typeof value.hyperlink === 'string') {
      return typeof value.text === 'string' && value.text.trim() ? value.text : value.hyperlink;
    }
  }
  return null;
};

const serializeWorkbookCellValue = (value: unknown): string | number | boolean => {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return JSON.stringify(value);
};

const buildWorkbookHeader = (column: string): string => {
  const label = COLUMN_LABELS[column] ?? column;
  return `${label}（${column}）`;
};

const suggestColumnWidth = (column: string): number => {
  if (column === AUTH_FILE_BATCH_REQUIRED_COLUMN) return 34;
  if (column.startsWith(AUTH_FILE_BATCH_INFO_PREFIX)) return 28;
  if (column.includes('token') || column.includes('cookie')) return 42;
  if (column.includes('proxy') || column.includes('host')) return 36;
  if (column.includes('models')) return 30;
  return 24;
};
