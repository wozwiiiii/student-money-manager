import { InputNumber } from 'antd';
import { formatCents, parseAmountToCents } from '@/lib/money';

interface AmountInputProps {
  /** 值为分（null 表示未填） */
  value?: number | null;
  onChange?: (cents: number | null) => void;
  placeholder?: string;
  /** 必填但当前为空时标红（由表单校验驱动） */
  invalid?: boolean;
}

/** 金额输入（元）：字符串解析为整数分，杜绝浮点误差（AGENT.md §4.3） */
export default function AmountInput({ value, onChange, placeholder, invalid }: AmountInputProps) {
  return (
    <InputNumber<string>
      style={{ width: '100%', borderColor: invalid ? '#ff4d4f' : undefined }}
      stringMode
      min="0"
      precision={2}
      placeholder={placeholder ?? '请输入金额'}
      value={value != null ? formatCents(value) : undefined}
      onChange={(v) => {
        if (v == null || v === '') {
          onChange?.(null);
          return;
        }
        onChange?.(parseAmountToCents(v));
      }}
    />
  );
}
