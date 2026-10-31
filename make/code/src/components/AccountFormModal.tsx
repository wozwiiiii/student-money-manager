import { useEffect, useState } from 'react';
import { AutoComplete, DatePicker, Form, Input, InputNumber, Modal, Radio, Select, Switch, Typography, message } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import AmountInput from './AmountInput';
import { useAssetsStore } from '@/stores/useAssetsStore';
import { ASSET_TYPE_ORDER, addDays } from '@/lib/assets';
import type { Account, AssetType, RiskLevel } from '@/lib/types';

/**
 * 账户新建/编辑表单（02 §2.4）。
 * - 先选资产类型，类型一经保存不可修改（02 §2.4.1）
 * - 各类型字段按 02 §2.6 定义；同名账户允许保存但提示一次（02 §2.4.5）
 */

/** 常用默认名（02 §2.4.5 [默认名清单 TBD]，此处按文档举例落常用值） */
const DEFAULT_NAMES: Record<AssetType, string[]> = {
  cash: ['余额宝', '零钱通', '银行卡', '现金'],
  fixed: ['银行定期', '银行理财', '理财通理财'],
  fund: ['场外基金'],
};

/** 期限预置选项（02 §2.6.2 [选项集 TBD]，此处落常用值，可自定义天数） */
const TERM_PRESETS = [
  { label: '3 个月', days: 90 },
  { label: '6 个月', days: 180 },
  { label: '1 年', days: 365 },
  { label: '2 年', days: 730 },
  { label: '3 年', days: 1095 },
  { label: '自定义天数', days: -1 },
];

const RISK_OPTIONS: Array<{ label: string; value: RiskLevel | 'unknown' }> = [
  { label: '低', value: 'low' },
  { label: '中低', value: 'mediumLow' },
  { label: '中', value: 'medium' },
  { label: '中高', value: 'mediumHigh' },
  { label: '高', value: 'high' },
  { label: '不确定', value: 'unknown' },
];

interface AccountFormModalProps {
  open: boolean;
  /** 编辑时传入；新建时为空 */
  account?: Account | null;
  /** 新建时的默认资产类型 */
  defaultAssetType?: AssetType;
  onCancel: () => void;
  onSaved: (created: Account) => void;
}

interface FormValues {
  assetType: AssetType;
  name: string;
  includeInTotal: boolean;
  note?: string;
  principalCents?: number | null;
  purchaseDate?: Dayjs;
  termPreset?: number;
  customTermDays?: number;
  maturityDate?: Dayjs;
  displayRatePercent?: number | null;
  riskLevel?: RiskLevel | 'unknown' | null;
  fundName?: string;
}

export default function AccountFormModal({
  open,
  account,
  defaultAssetType,
  onCancel,
  onSaved,
}: AccountFormModalProps) {
  const [form] = Form.useForm<FormValues>();
  const { accounts, addAccount, updateAccount } = useAssetsStore();
  const [assetType, setAssetType] = useState<AssetType>(defaultAssetType ?? 'cash');
  const [customTerm, setCustomTerm] = useState(false);
  const editing = !!account;

  useEffect(() => {
    if (!open) return;
    const type = account?.assetType ?? defaultAssetType ?? 'cash';
    setAssetType(type);
    setCustomTerm(!!account?.termDays && !TERM_PRESETS.some((p) => p.days === account.termDays));
    form.resetFields();
    form.setFieldsValue({
      assetType: type,
      name: account?.name ?? '',
      includeInTotal: account?.includeInTotal ?? true,
      note: account?.note,
      principalCents: account?.principalCents ?? null,
      purchaseDate: account?.purchaseDate ? dayjs(account.purchaseDate) : undefined,
      termPreset: TERM_PRESETS.some((p) => p.days === account?.termDays) ? account?.termDays : -1,
      customTermDays: customTerm ? account?.termDays : undefined,
      maturityDate: account?.maturityDate ? dayjs(account.maturityDate) : undefined,
      displayRatePercent: account?.displayRatePercent ?? null,
      riskLevel: account?.riskLevel ?? null,
      fundName: account?.fundName,
    });
  }, [open, account, defaultAssetType, form, customTerm]);

  const applyTerm = (purchaseDate: Dayjs | undefined, termDays: number | undefined) => {
    if (purchaseDate && termDays && termDays > 0) {
      form.setFieldValue('maturityDate', dayjs(addDays(purchaseDate.format('YYYY-MM-DD'), termDays)));
    }
  };

  const handleOk = async () => {
    const values = await form.validateFields();
    const name = values.name.trim();
    // 同名提示一次，不阻止保存（02 §2.4.5）
    if (accounts.some((a) => a.name === name && a.id !== account?.id)) {
      message.warning('已存在同名账户');
    }
    const termDays =
      values.termPreset === -1 ? (values.customTermDays ?? undefined) : values.termPreset;

    const common = {
      name,
      includeInTotal: values.includeInTotal,
      note: values.note?.trim() || undefined,
    };

    if (editing && account) {
      await updateAccount(account.id, {
        ...common,
        ...(account.assetType === 'fixed'
          ? {
              principalCents: values.principalCents ?? undefined,
              purchaseDate: values.purchaseDate?.format('YYYY-MM-DD'),
              termDays,
              maturityDate: values.maturityDate?.format('YYYY-MM-DD'),
              displayRatePercent: values.displayRatePercent ?? null,
              riskLevel: values.riskLevel ?? null,
            }
          : {}),
        ...(account.assetType === 'fund' ? { fundName: values.fundName?.trim() || undefined } : {}),
      });
      message.success('账户已更新');
      onSaved(account);
    } else {
      const created = await addAccount({
        ...common,
        assetType,
        ...(assetType === 'fixed'
          ? {
              principalCents: values.principalCents ?? undefined,
              purchaseDate: values.purchaseDate?.format('YYYY-MM-DD'),
              termDays,
              maturityDate: values.maturityDate?.format('YYYY-MM-DD'),
              displayRatePercent: values.displayRatePercent ?? null,
              riskLevel: values.riskLevel ?? null,
            }
          : {}),
        ...(assetType === 'fund' ? { fundName: values.fundName?.trim() || undefined } : {}),
      });
      message.success('账户已创建');
      onSaved(created);
    }
  };

  return (
    <Modal
      title={editing ? '编辑账户' : '添加账户'}
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      okText="保存"
      cancelText="取消"
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        {!editing && (
          <Form.Item label="资产类型" name="assetType" rules={[{ required: true }]}>
            <Radio.Group
              onChange={(e) => setAssetType(e.target.value as AssetType)}
              options={ASSET_TYPE_ORDER.map((t) => ({ label: t.label, value: t.key }))}
            />
          </Form.Item>
        )}
        {!editing && (
          <Typography.Paragraph type="secondary" style={{ marginTop: -8 }}>
            {ASSET_TYPE_ORDER.find((t) => t.key === assetType)?.explain}
          </Typography.Paragraph>
        )}

        <Form.Item
          label="账户名称"
          name="name"
          rules={[{ required: true, message: '请填写账户名称' }]}
        >
          <AutoComplete
            placeholder="选择或输入名称，如「余额宝」"
            options={DEFAULT_NAMES[assetType].map((n) => ({ label: n, value: n }))}
          />
        </Form.Item>

        {assetType === 'fixed' && (
          <>
            <Form.Item
              label="本金"
              name="principalCents"
              rules={[{ required: true, message: '请填写本金' }]}
            >
              <AmountInput placeholder="最初存入/投入的金额" />
            </Form.Item>
            <Form.Item
              label="存入/购买日期"
              name="purchaseDate"
              rules={[{ required: true, message: '请选择存入/购买日期' }]}
            >
              <DatePicker
                style={{ width: '100%' }}
                disabledDate={(d) => d.isAfter(dayjs(), 'day')}
                onChange={(d) => applyTerm(d, form.getFieldValue('termPreset'))}
              />
            </Form.Item>
            <Form.Item label="期限" name="termPreset" rules={[{ required: true }]}>
              <Select
                options={TERM_PRESETS.map((p) => ({ label: p.label, value: p.days }))}
                onChange={(v: number) => {
                  setCustomTerm(v === -1);
                  applyTerm(form.getFieldValue('purchaseDate'), v === -1 ? undefined : v);
                }}
              />
            </Form.Item>
            {customTerm && (
              <Form.Item
                label="自定义期限（天）"
                name="customTermDays"
                rules={[{ required: true, message: '请填写天数' }]}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  min={1}
                  precision={0}
                  onChange={(v) => applyTerm(form.getFieldValue('purchaseDate'), v ?? undefined)}
                />
              </Form.Item>
            )}
            <Form.Item
              label="到期日"
              name="maturityDate"
              rules={[
                { required: true, message: '请选择到期日' },
                {
                  validator: (_, v?: Dayjs) => {
                    const purchase = form.getFieldValue('purchaseDate') as Dayjs | undefined;
                    if (v && purchase && v.isBefore(purchase, 'day')) {
                      return Promise.reject(new Error('到期日不能早于存入日期'));
                    }
                    return Promise.resolve();
                  },
                },
              ]}
            >
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              label="展示收益率（%）"
              name="displayRatePercent"
              extra="展示收益率为参考值而非承诺，实际收益以产品到期结算为准。本产品不内置、不核实任何产品的收益率数值。"
            >
              <InputNumber style={{ width: '100%' }} min={0} precision={2} placeholder="从产品页面抄录，选填" />
            </Form.Item>
            <Form.Item label="风险等级" name="riskLevel" extra="选填；不确定可留空或选「不确定」">
              <Select allowClear options={RISK_OPTIONS} placeholder="选填" />
            </Form.Item>
          </>
        )}

        {assetType === 'fund' && (
          <Form.Item
            label="基金名称"
            name="fundName"
            extra="份额 = 持有的基金份数（买入金额 ÷ 买入时的净值）；净值 = 每份基金的单位价格；持有金额 = 份额 × 净值，随净值涨跌变化。份额与净值在每次快照更新时录入。"
          >
            <Input placeholder="选填，如「某某指数基金」" />
          </Form.Item>
        )}

        <Form.Item
          label="是否计入总资产"
          name="includeInTotal"
          valuePropName="checked"
          extra="不计入的账户余额照常展示，但不参与总资产合计"
        >
          <Switch checkedChildren="计入" unCheckedChildren="不计入" />
        </Form.Item>

        <Form.Item label="备注" name="note">
          <Input.TextArea rows={2} placeholder="选填；请勿填写密码、证件号等敏感信息" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
