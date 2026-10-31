import { useEffect, useMemo, useState } from 'react';
import { Alert, DatePicker, InputNumber, Modal, Radio, Space, Typography, message } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import AmountInput from './AmountInput';
import { useAssetsStore } from '@/stores/useAssetsStore';
import { ASSET_TYPE_ORDER, fundAmountCents, isLargeChange, sameMinuteKey } from '@/lib/assets';
import type { Account, AssetSnapshot } from '@/lib/types';

/**
 * 资产快照录入/编辑（02 §3）。
 * - 全部使用中账户逐个录入；默认带出上次快照值，「与上次相同可保持不变」
 * - 校验：金额非负两位小数、时间不晚于现在、同分钟唯一、±50% 大幅变化确认、补录早于最早快照确认
 * - 基金持仓支持方式 A（份额×净值）与方式 B（持有金额）
 */

interface AccountInputState {
  cents: number | null;
  fundMode: 'unitsNav' | 'amount';
  units: number | null;
  nav: number | null;
}

interface SnapshotFormModalProps {
  open: boolean;
  /** 编辑时传入 */
  editSnapshot?: AssetSnapshot | null;
  onCancel: () => void;
  onSaved: () => void;
}

export default function SnapshotFormModal({ open, editSnapshot, onCancel, onSaved }: SnapshotFormModalProps) {
  const { accounts, snapshots, latestEntryOf, saveSnapshot } = useAssetsStore();
  const [takenAt, setTakenAt] = useState<Dayjs>(dayjs());
  const [inputs, setInputs] = useState<Record<string, AccountInputState>>({});
  const editing = !!editSnapshot;
  const activeAccounts = useMemo(() => accounts.filter((a) => !a.deletedAt), [accounts]);

  useEffect(() => {
    if (!open) return;
    const init: Record<string, AccountInputState> = {};
    for (const account of activeAccounts) {
      const existing = editSnapshot?.entries.find((e) => e.accountId === account.id);
      const source = existing ?? latestEntryOf(account.id)?.entry ?? null;
      init[account.id] = {
        cents: source?.balanceCents ?? (editing ? null : account.assetType === 'fixed' ? (account.principalCents ?? null) : null),
        fundMode: source?.units != null && source?.nav != null ? 'unitsNav' : 'amount',
        units: source?.units ?? null,
        nav: source?.nav ?? null,
      };
    }
    setInputs(init);
    setTakenAt(editSnapshot ? dayjs(editSnapshot.takenAt) : dayjs());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editSnapshot?.id]);

  const patch = (accountId: string, values: Partial<AccountInputState>) => {
    setInputs((prev) => ({ ...prev, [accountId]: { ...prev[accountId], ...values } }));
  };

  const balanceOf = (account: Account, state: AccountInputState | undefined): number | null => {
    if (!state) return null;
    if (account.assetType === 'fund' && state.fundMode === 'unitsNav') {
      if (state.units == null || state.nav == null || state.nav <= 0) return null;
      return fundAmountCents(state.units, state.nav);
    }
    return state.cents;
  };

  const handleSave = async () => {
    // 时间校验（02 §3.4.3）
    if (takenAt.isAfter(dayjs())) {
      message.error('快照时间不能晚于现在');
      return;
    }
    // 全部使用中账户必须有数值（02 §3.4.2）
    const missing = activeAccounts.filter((a) => balanceOf(a, inputs[a.id]) === null);
    if (missing.length > 0) {
      message.error(`请填写：${missing.map((a) => a.name).join('、')}`);
      return;
    }

    const entries = activeAccounts.map((a) => {
      const state = inputs[a.id];
      return {
        accountId: a.id,
        balanceCents: balanceOf(a, state) ?? 0,
        units: a.assetType === 'fund' && state?.fundMode === 'unitsNav' ? state.units : null,
        nav: a.assetType === 'fund' && state?.fundMode === 'unitsNav' ? state.nav : null,
      };
    });

    // 同分钟重复快照（02 §3.4.3）
    const takenIso = takenAt.toISOString();
    const conflict = snapshots.find(
      (s) => s.id !== editSnapshot?.id && sameMinuteKey(s.takenAt) === sameMinuteKey(takenIso),
    );
    if (conflict) {
      message.error('该时间已有快照，请调整时间或编辑原快照');
      return;
    }

    // 补录早于现有最早快照需确认（02 §3.4.3）
    const earliest = snapshots.filter((s) => s.id !== editSnapshot?.id)[0];
    if (earliest && takenIso < earliest.takenAt) {
      Modal.confirm({
        title: '确认补录？',
        content: `该时间早于你最早的快照（${dayjs(earliest.takenAt).format('YYYY-MM-DD')}），确认补录？`,
        okText: '确认补录',
        cancelText: '取消',
        onOk: () => void doSave(entries, takenIso),
      });
      return;
    }
    await doSave(entries, takenIso);
  };

  const doSave = async (
    entries: { accountId: string; balanceCents: number; units: number | null; nav: number | null }[],
    takenIso: string,
  ) => {
    // 余额大幅变化 ±50% 需确认（02 §3.4.3 [阈值 TBD]）
    const largeChanges = activeAccounts.filter((a) => {
      const prev = editSnapshot
        ? (editSnapshot.entries.find((e) => e.accountId === a.id)?.balanceCents ?? null)
        : (latestEntryOf(a.id)?.entry.balanceCents ?? null);
      const next = entries.find((e) => e.accountId === a.id)?.balanceCents ?? 0;
      return isLargeChange(prev, next);
    });
    if (largeChanges.length > 0 && !editSnapshot) {
      Modal.confirm({
        title: '与上次相差较大，请核对',
        content: `以下账户余额与上次快照相比偏差超过 50%：${largeChanges.map((a) => a.name).join('、')}。确认无误可继续保存。`,
        okText: '确认无误，保存',
        cancelText: '返回核对',
        onOk: () => void commit(entries, takenIso),
      });
      return;
    }
    await commit(entries, takenIso);
  };

  const commit = async (
    entries: { accountId: string; balanceCents: number; units: number | null; nav: number | null }[],
    takenIso: string,
  ) => {
    try {
      await saveSnapshot({ takenAt: takenIso, entries }, editSnapshot?.id);
      message.success(editing ? '快照已更新' : '快照已保存');
      onSaved();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '保存失败');
    }
  };

  const renderAccountInput = (account: Account) => {
    const state = inputs[account.id];
    return (
      <div key={account.id} style={{ marginBottom: 12 }}>
        <Typography.Text>
          {account.name}
          {!account.includeInTotal && (
            <Typography.Text type="secondary">（不计入总资产）</Typography.Text>
          )}
        </Typography.Text>
        {account.assetType === 'fund' && (
          <Radio.Group
            size="small"
            style={{ marginLeft: 12 }}
            value={state?.fundMode}
            onChange={(e) => patch(account.id, { fundMode: e.target.value as 'unitsNav' | 'amount' })}
            options={[
              { label: '份额 + 净值', value: 'unitsNav' },
              { label: '持有金额', value: 'amount' },
            ]}
          />
        )}
        <div style={{ marginTop: 6 }}>
          {account.assetType === 'fund' && state?.fundMode === 'unitsNav' ? (
            <Space>
              <InputNumber
                style={{ width: 160 }}
                min={0}
                precision={2}
                placeholder="份额"
                value={state.units ?? undefined}
                onChange={(v) => patch(account.id, { units: v ?? null })}
              />
              <InputNumber
                style={{ width: 160 }}
                min={0}
                precision={4}
                placeholder="净值（正数）"
                value={state.nav ?? undefined}
                onChange={(v) => patch(account.id, { nav: v ?? null })}
              />
              <Typography.Text type="secondary">
                = {balanceOf(account, state) != null ? `¥${((balanceOf(account, state) ?? 0) / 100).toFixed(2)}` : '—'}
              </Typography.Text>
            </Space>
          ) : (
            <AmountInput
              value={state?.cents ?? null}
              onChange={(cents) => patch(account.id, { cents })}
              placeholder={
                account.assetType === 'fixed'
                  ? '当前价值（从产品页面抄录）'
                  : account.assetType === 'fund'
                    ? '持有金额（从基金页面抄录）'
                    : '余额'
              }
            />
          )}
        </div>
      </div>
    );
  };

  return (
    <Modal
      title={editing ? '编辑快照' : '更新快照'}
      open={open}
      onOk={handleSave}
      onCancel={onCancel}
      okText="保存快照"
      cancelText="取消"
      destroyOnClose
    >
      <div style={{ marginBottom: 12 }}>
        <Typography.Text>快照时间：</Typography.Text>
        <DatePicker
          showTime
          allowClear={false}
          value={takenAt}
          disabledDate={(d) => d.isAfter(dayjs(), 'day')}
          onChange={(d) => d && setTakenAt(d)}
        />
      </div>
      {snapshots.length > 0 && !editing && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="已默认带出上次快照的值，与上次相同可保持不变"
        />
      )}
      {ASSET_TYPE_ORDER.map((group) => {
        const groupAccounts = activeAccounts.filter((a) => a.assetType === group.key);
        if (groupAccounts.length === 0) return null;
        return (
          <div key={group.key} style={{ marginBottom: 8 }}>
            <Typography.Title level={5} style={{ marginTop: 8 }}>
              {group.label}
            </Typography.Title>
            {groupAccounts.map(renderAccountInput)}
          </div>
        );
      })}
    </Modal>
  );
}
