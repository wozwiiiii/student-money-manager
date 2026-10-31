import { useState } from 'react';
import { Alert, Button, Modal, Radio, Select, Space, Steps, Table, Tag, Typography, Upload, message } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import { parseBillCsv, type BillPlatform, type BillRow } from '@/lib/csv';
import { fallbackCategoryId, matchCategory } from '@/lib/mapping';
import { useTransactionsStore } from '@/stores/useTransactionsStore';
import { useCategoriesStore } from '@/stores/useCategoriesStore';
import { formatYuan, sumCents } from '@/lib/money';
import type { Transaction } from '@/lib/types';

/**
 * 账单 CSV 导入向导（02 §4.4.8）：选择文件并确认来源 → 预览 → 结果。
 * - 分类映射（02 §4.4.5）：关键词匹配，自定义规则优先；未匹配可指定，确认时仍未分类归入「其他」
 * - 去重（02 §4.4.6）：同日期+同金额+同描述 → 疑似重复，默认跳过，可改「仍然导入」
 * - 仅确认导入后才产生数据；取消不留存任何记录（02 §4.7）
 */

interface PreviewRow extends BillRow {
  index: number;
  categoryId: string | null;
  duplicate: boolean;
  skip: boolean;
}

interface ImportWizardModalProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

const SOURCE_LABEL: Record<BillPlatform, Transaction['source']> = {
  alipay: 'alipay_csv',
  wechat: 'wechat_csv',
};

export default function ImportWizardModal({ open, onClose, onImported }: ImportWizardModalProps) {
  const { transactions, addTransaction, load } = useTransactionsStore();
  const { categories, mappingRules, load: loadCategories } = useCategoriesStore();
  const [step, setStep] = useState(0);
  const [platform, setPlatform] = useState<BillPlatform>('alipay');
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [failedLines, setFailedLines] = useState(0);
  const [filteredLines, setFilteredLines] = useState(0);
  const [importedCount, setImportedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [importedSum, setImportedSum] = useState({ incomeCents: 0, expenseCents: 0 });

  const reset = () => {
    setStep(0);
    setPreview([]);
    setFailedLines(0);
    setFilteredLines(0);
  };

  const handleFile = async (file: File) => {
    void loadCategories();
    const text = await file.text();
    const outcome = parseBillCsv(text);
    if (outcome.error) {
      message.error(outcome.error);
      return false;
    }
    // 来源平台预选（02 §4.4.8 [识别方案 TBD]：按文件文本特征预选，用户可改）
    if (text.includes('支付宝')) setPlatform('alipay');
    else if (text.includes('微信')) setPlatform('wechat');

    // 去重比对（02 §4.4.6）：与已保存的全部收支记录比对，不区分数据来源
    const existingKeys = new Set(
      transactions.map((t) => `${t.date}|${t.amountCents}|${t.originalMemo ?? t.memo ?? ''}`),
    );
    const rows: PreviewRow[] = outcome.rows.map((row, index) => {
      const duplicate = existingKeys.has(`${row.date}|${row.amountCents}|${row.description}`);
      return {
        ...row,
        index,
        categoryId:
          row.direction === 'transfer'
            ? null
            : matchCategory(row.description, row.direction, mappingRules, categories),
        duplicate,
        skip: duplicate,
      };
    });
    setPreview(rows);
    setFailedLines(outcome.failedLines);
    setFilteredLines(outcome.filteredLines);
    setStep(1);
    return false; // 阻止 antd 自动上传
  };

  const unclassified = preview.filter((r) => r.direction !== 'transfer' && r.categoryId === null);
  const duplicates = preview.filter((r) => r.duplicate);
  const toImport = preview.filter((r) => !r.skip);

  const handleConfirm = async () => {
    let imported = 0;
    for (const row of toImport) {
      let categoryId = row.categoryId;
      if (row.direction !== 'transfer' && categoryId === null) {
        categoryId = fallbackCategoryId(row.direction, categories); // 02 §4.4.5 兜底
      }
      await addTransaction({
        date: row.date,
        direction: row.direction,
        amountCents: row.amountCents,
        categoryId: row.direction === 'transfer' ? null : categoryId,
        accountId: null,
        counterAccountId: null,
        source: SOURCE_LABEL[platform],
        memo: row.description || undefined,
        originalMemo: row.description,
      });
      imported++;
    }
    void load();
    setImportedCount(imported);
    setSkippedCount(preview.length - imported);
    setImportedSum({
      incomeCents: sumCents(toImport.filter((r) => r.direction === 'income').map((r) => r.amountCents)),
      expenseCents: sumCents(toImport.filter((r) => r.direction === 'expense').map((r) => r.amountCents)),
    });
    setStep(2);
    onImported();
  };

  const renderPreview = () => (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <Tag>总行数 {preview.length}</Tag>
        <Tag color="green">将导入 {toImport.length}</Tag>
        <Tag color="orange">疑似重复 {duplicates.length}</Tag>
        <Tag color="red">未分类 {unclassified.length}</Tag>
        {failedLines > 0 && <Tag color="red">无法读取 {failedLines} 行</Tag>}
        {filteredLines > 0 && <Tag>非成功状态已过滤 {filteredLines} 行</Tag>}
      </Space>
      {duplicates.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={`本次 ${duplicates.length} 笔与已有记录疑似重复，你可能已导入过这份文件（默认跳过，可逐笔改为仍然导入）`}
        />
      )}
      {unclassified.length > 0 && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message={`${unclassified.length} 笔未匹配到分类，可逐笔指定；确认导入时仍未指定的将归入「其他支出 / 其他收入」`}
        />
      )}
      <Table<PreviewRow>
        rowKey="index"
        size="small"
        dataSource={preview}
        pagination={{ pageSize: 8 }}
        columns={[
          { title: '日期', dataIndex: 'date', width: 100 },
          {
            title: '描述',
            dataIndex: 'description',
            ellipsis: true,
            render: (v: string) => v || '—',
          },
          {
            title: '金额',
            dataIndex: 'amountCents',
            width: 100,
            render: (v: number) => formatYuan(v),
          },
          {
            title: '方向',
            dataIndex: 'direction',
            width: 70,
            render: (v: BillRow['direction']) =>
              ({ expense: '支出', income: '收入', transfer: '转账' })[v],
          },
          {
            title: '分类',
            width: 150,
            render: (_, row) =>
              row.direction === 'transfer' ? (
                <Typography.Text type="secondary">不参与统计</Typography.Text>
              ) : (
                <Select
                  size="small"
                  style={{ width: '100%' }}
                  allowClear
                  placeholder="未分类"
                  value={row.categoryId ?? undefined}
                  onChange={(v) =>
                    setPreview((prev) =>
                      prev.map((r) => (r.index === row.index ? { ...r, categoryId: v ?? null } : r)),
                    )
                  }
                  options={categories
                    .filter((c) => c.level === 1 && c.direction === row.direction)
                    .map((c) => ({ label: c.name, value: c.id }))}
                />
              ),
          },
          {
            title: '重复处理',
            width: 130,
            render: (_, row) =>
              row.duplicate ? (
                <Select
                  size="small"
                  style={{ width: '100%' }}
                  value={row.skip ? 'skip' : 'import'}
                  onChange={(v) =>
                    setPreview((prev) =>
                      prev.map((r) => (r.index === row.index ? { ...r, skip: v === 'skip' } : r)),
                    )
                  }
                  options={[
                    { label: '跳过', value: 'skip' },
                    { label: '仍然导入', value: 'import' },
                  ]}
                />
              ) : (
                <Tag color="green">正常导入</Tag>
              ),
          },
        ]}
      />
    </>
  );

  return (
    <Modal
      title="导入账单"
      open={open}
      onCancel={() => {
        reset();
        onClose();
      }}
      width={840}
      footer={
        step === 0
          ? null
          : step === 1
            ? [
                <Button
                  key="cancel"
                  onClick={() => {
                    reset();
                    onClose();
                  }}
                >
                  取消
                </Button>,
                <Button key="ok" type="primary" onClick={handleConfirm}>
                  确认导入（{toImport.length} 笔）
                </Button>,
              ]
            : [
                <Button
                  key="done"
                  type="primary"
                  onClick={() => {
                    reset();
                    onClose();
                  }}
                >
                  完成
                </Button>,
              ]
      }
    >
      <Steps
        size="small"
        current={step}
        style={{ marginBottom: 16 }}
        items={[{ title: '选择文件' }, { title: '预览' }, { title: '结果' }]}
      />
      {step === 0 && (
        <Space direction="vertical" style={{ width: '100%' }}>
          <Radio.Group
            value={platform}
            onChange={(e) => setPlatform(e.target.value as BillPlatform)}
            options={[
              { label: '支付宝账单 CSV', value: 'alipay' },
              { label: '微信账单 CSV', value: 'wechat' },
            ]}
          />
          <Upload.Dragger
            accept=".csv"
            maxCount={1}
            beforeUpload={(file) => handleFile(file)}
            showUploadList={false}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">点击或拖入支付宝/微信导出的账单 CSV 文件</p>
          </Upload.Dragger>
          <Alert
            type="info"
            showIcon
            message="如何导出账单"
            description={
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                <li>支付宝：App 内进入「账单」，查找「开具交易流水证明 / 导出账单」类功能，选择时间范围后导出</li>
                <li>微信：「我 — 服务 — 钱包 — 账单」，查找「下载账单 / 导出」，选择个人对账类型</li>
                <li>收到文件后请勿用 Excel 等软件打开另存（可能改变文件内容），直接在此导入</li>
              </ul>
            }
          />
          <Typography.Text type="secondary">
            银行流水文件导入暂未开放：各银行格式互不相同，支持范围待定义后再实现。
          </Typography.Text>
        </Space>
      )}
      {step === 1 && renderPreview()}
      {step === 2 && (
        <Space direction="vertical">
          <Typography.Title level={4} style={{ margin: 0 }}>
            导入完成
          </Typography.Title>
          <Typography.Text>导入成功 {importedCount} 笔；跳过（疑似重复）{skippedCount} 笔；无法读取 {failedLines} 行。</Typography.Text>
          <Typography.Text>
            本次导入覆盖时间段：收入合计 {formatYuan(importedSum.incomeCents)}，支出合计 {formatYuan(importedSum.expenseCents)}
          </Typography.Text>
        </Space>
      )}
    </Modal>
  );
}
