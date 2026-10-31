import { parseAmountToCents } from './money';

/**
 * 支付宝 / 微信账单 CSV 解析（02 §4.4.2～4.4.4）。
 *
 * [TBD] 两家平台导出文件的具体列名清单 spec 未给出（02 §4.4.2），此处按公开导出格式的常见列名做
 * 关键词柔性匹配；实现已通过示例账单测试，正式上线前须用用户真实导出文件校验后再定稿模板。
 * [TBD] 退款类记录方向（02 §4.4.4）：当前按账单标注方向保守处理，不自动冲抵原支出。
 */

export type BillPlatform = 'alipay' | 'wechat';

export interface BillRow {
  /** YYYY-MM-DD */
  date: string;
  direction: 'income' | 'expense' | 'transfer';
  amountCents: number;
  /** 交易描述拼接文本（02 §4.4.3 [拼接顺序 TBD]：按列顺序拼接非空字段） */
  description: string;
  status: string;
}

export interface ParseOutcome {
  rows: BillRow[];
  /** 无法读取的行数（缺关键信息或格式异常，02 §4.4.7） */
  failedLines: number;
  /** 因交易状态非成功被过滤的行数（02 §4.4.3） */
  filteredLines: number;
  /** 致命错误：无法识别 / 乱码 / 空文件（02 §4.4.7 文案） */
  error?: string;
}

const FATAL_UNRECOGNIZED = '无法识别该文件，请使用支付宝/微信导出的原始 CSV 文件';
const FATAL_GARBLED = '文件内容显示异常，请重新导出原文件，不要经其他软件转存';
const FATAL_EMPTY = '文件中没有账单数据，请确认导出时选择的时间范围';

/** 解析一行 CSV（支持引号包裹与转义） */
export function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

/** 方向取值转换（02 §4.4.4）；"不计收支"等资金移动记为转账 */
function toDirection(raw: string): BillRow['direction'] | null {
  const v = raw.trim();
  if (v === '支出') return 'expense';
  if (v === '收入') return 'income';
  // 微信导出中资金移动行的方向列可能为「不计收支」「/」「其他」或空
  if (v === '' || v === '/' || v === '不计收支' || v === '其他' || v === '不计收支/其他') {
    return 'transfer';
  }
  return null;
}

/** 非成功状态过滤（02 §4.4.3 [细则 TBD]：仅导入成功/已完成，状态为空视为通过） */
function isSuccessStatus(raw: string): boolean {
  const v = raw.trim();
  return v === '' || v.includes('成功') || v.includes('已完成');
}

function normalizeDate(raw: string): string | null {
  const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(raw.trim());
  if (!m) return null;
  const month = m[2].padStart(2, '0');
  const day = m[3].padStart(2, '0');
  return `${m[1]}-${month}-${day}`;
}

function toAmountCents(raw: string): number | null {
  const cleaned = raw.replace(/[¥￥,，\s元]/g, '');
  const cents = parseAmountToCents(cleaned);
  return cents === null ? null : Math.abs(cents);
}

interface ColumnPlan {
  dateIdx: number;
  amountIdx: number;
  directionIdx: number;
  statusIdx: number;
  descIdxs: number[];
}

function planColumns(header: string[]): ColumnPlan | null {
  const find = (pred: (h: string) => boolean) => header.findIndex(pred);
  const dateIdx = find((h) => h.includes('交易时间') || h.includes('日期'));
  const amountIdx = find((h) => h.includes('金额') && !h.includes('费率'));
  const directionIdx = find((h) => h === '收/支' || h.includes('收/支'));
  const statusIdx = find((h) => h.includes('交易状态') || h.includes('当前状态') || h.includes('状态'));
  if (dateIdx < 0 || amountIdx < 0) return null;
  // 描述拼接列（02 §4.4.3 [拼接顺序 TBD]，按列顺序取非空）
  const descIdxs = header
    .map((h, i) => ({ h, i }))
    .filter(({ h }) =>
      ['交易对方', '商品说明', '商品', '交易分类', '交易类型', '备注'].some((k) => h.includes(k)),
    )
    .map(({ i }) => i);
  return { dateIdx, amountIdx, directionIdx, statusIdx, descIdxs };
}

/** 解析账单 CSV 全文（02 §4.4.2：忽略无法识别为账单数据的标题/说明行） */
export function parseBillCsv(text: string): ParseOutcome {
  if (text.includes('�')) {
    return { rows: [], failedLines: 0, filteredLines: 0, error: FATAL_GARBLED };
  }
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // 找到表头行（含「交易时间」与「金额」）
  const headerIdx = lines.findIndex((l) => {
    const cells = parseCsvLine(l);
    return cells.some((c) => c.includes('交易时间')) && cells.some((c) => c.includes('金额'));
  });
  if (headerIdx < 0) {
    return { rows: [], failedLines: 0, filteredLines: 0, error: FATAL_UNRECOGNIZED };
  }
  const plan = planColumns(parseCsvLine(lines[headerIdx]));
  if (!plan) {
    return { rows: [], failedLines: 0, filteredLines: 0, error: FATAL_UNRECOGNIZED };
  }

  const rows: BillRow[] = [];
  let failedLines = 0;
  let filteredLines = 0;

  for (const line of lines.slice(headerIdx + 1)) {
    const cells = parseCsvLine(line);
    if (cells.every((c) => c === '')) continue;
    const date = normalizeDate(cells[plan.dateIdx] ?? '');
    const amountCents = toAmountCents(cells[plan.amountIdx] ?? '');
    const direction = plan.directionIdx >= 0 ? toDirection(cells[plan.directionIdx] ?? '') : null;
    if (!date || amountCents === null || direction === null) {
      failedLines++;
      continue;
    }
    const status = plan.statusIdx >= 0 ? (cells[plan.statusIdx] ?? '') : '';
    if (!isSuccessStatus(status)) {
      filteredLines++;
      continue;
    }
    const description = plan.descIdxs
      .map((i) => cells[i] ?? '')
      .filter((c) => c !== '')
      .join(' ');
    rows.push({ date, direction, amountCents, description, status: status.trim() });
  }

  if (rows.length === 0 && failedLines === 0 && filteredLines === 0) {
    return { rows: [], failedLines: 0, filteredLines: 0, error: FATAL_EMPTY };
  }
  return { rows, failedLines, filteredLines };
}
