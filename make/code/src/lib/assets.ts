import type { Account, AssetSnapshot, SnapshotEntry } from './types';
import { sumCents } from './money';

/**
 * 资产汇总纯函数（02 号文档口径）：
 * - 总资产 = 使用中且计入总资产的账户的当前余额之和（02 §5.4.1）
 * - 账户当前余额 = 该账户最近一次资产快照中的余额（01 §5.1）
 * - 趋势图直接使用快照保存时固定的总资产，不重算历史（02 §5.4.3）
 */

/** 账户分组的固定顺序（02 §5.4.2） */
export const ASSET_TYPE_ORDER: Array<{ key: Account['assetType']; label: string; explain: string }> = [
  {
    key: 'cash',
    label: '现金与活期',
    explain:
      '放在手头的现金、银行卡活期存款，以及余额宝、零钱通这类零钱理财（底层是货币基金：主要投资短期存款、债券等低风险品种，收益较低但波动小、可快速取出）。',
  },
  {
    key: 'fixed',
    label: '定期与理财产品',
    explain:
      '银行定期存款、银行理财、理财通理财等：资金需存放满约定期限后才能取出，通常收益高于活期，展示的收益率是参考值而非承诺。',
  },
  {
    key: 'fund',
    label: '基金持仓',
    explain:
      '通过支付宝、微信、银行等渠道申购和赎回的场外基金：持有金额随基金净值涨跌变化。',
  },
];

/** 日期字符串 YYYY-MM-DD 加天数，返回 YYYY-MM-DD（按本地日历计算，不受时区偏移影响） */
export function addDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 到期日剩余天数（负数表示已到期）；以当天 0 点为基准 */
export function daysUntil(dateStr: string, todayStr: string): number {
  const target = new Date(`${dateStr}T00:00:00`).getTime();
  const today = new Date(`${todayStr}T00:00:00`).getTime();
  return Math.round((target - today) / 86_400_000);
}

/**
 * 基金金额（分）= 份额 × 净值（02 §3.4.1 方式 A）。
 * 份额与净值是数量/单价而非金额，此处单次取整到分。
 */
export function fundAmountCents(units: number, nav: number): number {
  return Math.round(units * nav * 100);
}

/** 快照总资产（分）= entries 中计入总资产账户的余额之和（02 §3.6，保存时计算并固定） */
export function computeSnapshotTotalCents(
  entries: SnapshotEntry[],
  includedAccountIds: Set<string>,
): number {
  return sumCents(entries.filter((e) => includedAccountIds.has(e.accountId)).map((e) => e.balanceCents));
}

/** 取某账户最近一次快照值（快照按时间升序传入），无快照返回 null */
export function findLatestEntry(
  snapshotsAsc: AssetSnapshot[],
  accountId: string,
): { takenAt: string; entry: SnapshotEntry } | null {
  for (let i = snapshotsAsc.length - 1; i >= 0; i--) {
    const entry = snapshotsAsc[i].entries.find((e) => e.accountId === accountId);
    if (entry) return { takenAt: snapshotsAsc[i].takenAt, entry };
  }
  return null;
}

/** 当前总资产（02 §5.4.1）：使用中且计入总资产的账户，取各自最近快照余额求和；无快照的账户不计入 */
export function computeCurrentTotalCents(
  accounts: Account[],
  snapshotsAsc: AssetSnapshot[],
): number {
  const balances: number[] = [];
  for (const account of accounts) {
    if (account.deletedAt || !account.includeInTotal) continue;
    const latest = findLatestEntry(snapshotsAsc, account.id);
    if (latest) balances.push(latest.entry.balanceCents);
  }
  return sumCents(balances);
}

/** 余额大幅变化判定：与上次偏差超过 ±50%（02 §3.4.3 [阈值 TBD]，当前按 50% 实现） */
export function isLargeChange(prevCents: number | null, nextCents: number): boolean {
  if (prevCents === null || prevCents === 0) return false;
  return Math.abs(nextCents - prevCents) / Math.abs(prevCents) > 0.5;
}

export type TrendRange = 'all' | '1m' | '3m';

/** 趋势图数据点（02 §5.4.3）：横轴快照时间、纵轴该次快照保存时固定的总资产 */
export function trendPoints(
  snapshotsAsc: AssetSnapshot[],
  range: TrendRange,
  nowStr: string,
): Array<{ takenAt: string; totalCents: number }> {
  let filtered = snapshotsAsc;
  if (range !== 'all') {
    const days = range === '1m' ? 30 : 90;
    const cutoff = new Date(new Date(nowStr).getTime() - days * 86_400_000).toISOString();
    filtered = snapshotsAsc.filter((s) => s.takenAt >= cutoff);
  }
  return filtered.map((s) => ({ takenAt: s.takenAt, totalCents: s.totalCents }));
}

/** 同分钟重复快照判定（02 §3.4.3：快照时间精确到分钟，同一分钟只允许一条） */
export function sameMinuteKey(isoTime: string): string {
  return isoTime.slice(0, 16);
}
