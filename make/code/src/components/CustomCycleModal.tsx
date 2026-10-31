import { useEffect, useState } from 'react';
import { DatePicker, Form, Input, Modal, message } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useBudgetsStore } from '@/stores/useBudgetsStore';
import type { CustomCycle } from '@/lib/types';

/**
 * 自定义周期（如学期）创建/编辑（03 §4.2）。
 * 结束日期不得早于开始日期；起止可落在过去或未来（允许学期中段补建）。
 */
const NAME_MAX = 20; // [Assumption, TBD: 20 字]

interface CustomCycleModalProps {
  open: boolean;
  editCycle?: CustomCycle | null;
  onClose: () => void;
  onSaved: (cycle: CustomCycle) => void;
}

export default function CustomCycleModal({ open, editCycle, onClose, onSaved }: CustomCycleModalProps) {
  const { addCustomCycle, updateCustomCycle } = useBudgetsStore();
  const [name, setName] = useState('');
  const [start, setStart] = useState<Dayjs | null>(null);
  const [end, setEnd] = useState<Dayjs | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(editCycle?.name ?? '');
    setStart(editCycle ? dayjs(editCycle.startDate) : null);
    setEnd(editCycle ? dayjs(editCycle.endDate) : null);
  }, [open, editCycle]);

  const handleSave = async () => {
    if (!name.trim()) {
      message.error('请填写周期名称');
      return;
    }
    if (!start || !end) {
      message.error('请选择开始与结束日期');
      return;
    }
    if (end.isBefore(start, 'day')) {
      message.error('结束日期不能早于开始日期');
      return;
    }
    const payload = {
      name: name.trim(),
      startDate: start.format('YYYY-MM-DD'),
      endDate: end.format('YYYY-MM-DD'),
    };
    if (editCycle) {
      await updateCustomCycle(editCycle.id, payload);
      onSaved({ ...editCycle, ...payload });
    } else {
      await addCustomCycle(payload);
      onSaved({ id: '', ...payload, ended: false, createdAt: '' });
    }
    message.success(editCycle ? '周期已更新' : '周期已创建');
  };

  return (
    <Modal
      title={editCycle ? '编辑周期' : '新建周期'}
      open={open}
      onOk={handleSave}
      onCancel={onClose}
      okText="保存"
      cancelText="取消"
      destroyOnClose
    >
      <Form layout="vertical">
        <Form.Item label={`周期名称（最多 ${NAME_MAX} 字）`} required>
          <Input
            maxLength={NAME_MAX}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="如「秋季学期」"
          />
        </Form.Item>
        <Form.Item label="开始日期" required>
          <DatePicker style={{ width: '100%' }} value={start} onChange={setStart} allowClear={false} />
        </Form.Item>
        <Form.Item label="结束日期" required>
          <DatePicker style={{ width: '100%' }} value={end} onChange={setEnd} allowClear={false} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
