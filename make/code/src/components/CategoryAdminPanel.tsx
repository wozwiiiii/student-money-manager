import { useEffect, useState } from 'react';
import {
  Button,
  Input,
  Modal,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useCategoriesStore } from '@/stores/useCategoriesStore';
import { transactionsRepo } from '@/db/repositories';
import {
  CATEGORY_NAME_MAX,
  canDeleteCategory,
  canDisableCategory,
  isCoreBuiltin,
  migrationCandidates,
  validateCategoryName,
} from '@/lib/categoryAdmin';
import type { Category } from '@/lib/types';

/**
 * 分类管理（05 第 3 章）：新增、重命名、删除（含迁移）、停用 / 启用。
 * 核心内置分类不可删除、不可停用（05 §3.4 [Assumption, TBD]）；
 * 删除分类时其分类预算一并移除（05 §3.3），由 store 统一处理。
 */
export default function CategoryAdminPanel() {
  const {
    categories,
    load,
    addCategory,
    updateCategory,
    setDisabled,
    removeCategory,
    removeCategoryWithMigration,
  } = useCategoriesStore();
  const [recordCounts, setRecordCounts] = useState<Record<string, number>>({});

  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addDirection, setAddDirection] = useState<'expense' | 'income'>('expense');
  const [addError, setAddError] = useState<string | null>(null);

  const [renaming, setRenaming] = useState<Category | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState<Category | null>(null);
  const [migrateTargetId, setMigrateTargetId] = useState<string | null>(null);
  const [deleteMode, setDeleteMode] = useState<'migrate' | 'disable'>('migrate');

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 各分类下收支记录条数（05 §3.3 删除保护判定）
  useEffect(() => {
    void (async () => {
      const counts: Record<string, number> = {};
      for (const t of await transactionsRepo.all()) {
        if (t.categoryId) counts[t.categoryId] = (counts[t.categoryId] ?? 0) + 1;
      }
      setRecordCounts(counts);
    })();
  }, [categories.length]);

  const refreshCounts = async () => {
    const counts: Record<string, number> = {};
    for (const t of await transactionsRepo.all()) {
      if (t.categoryId) counts[t.categoryId] = (counts[t.categoryId] ?? 0) + 1;
    }
    setRecordCounts(counts);
  };

  const handleAdd = async () => {
    const err = validateCategoryName(addName, addDirection, categories);
    setAddError(err);
    if (err) return;
    const maxSort = categories.reduce((m, c) => Math.max(m, c.sortOrder), -1);
    await addCategory({
      name: addName.trim(),
      direction: addDirection,
      parentId: null,
      level: 1,
      builtin: false,
      disabled: false,
      sortOrder: maxSort + 1,
    });
    setAddOpen(false);
    setAddName('');
    message.success('已新增分类，即时生效');
  };

  const handleRename = async () => {
    if (!renaming) return;
    const err = validateCategoryName(renameValue, renaming.direction, categories, renaming.id);
    setRenameError(err);
    if (err) return;
    // 重命名只改名称，分类身份不变（05 §3.2）：记录、预算、映射关联均不受影响
    await updateCategory(renaming.id, { name: renameValue.trim() });
    setRenaming(null);
    message.success('已重命名，历史记录与统计图中的名称展示同步更新');
  };

  const handleDeleteConfirm = async () => {
    if (!deleting) return;
    const count = recordCounts[deleting.id] ?? 0;
    if (count > 0) {
      if (deleteMode === 'disable') {
        await setDisabled(deleting.id, true);
        setDeleting(null);
        message.success('已停用该分类，记录与统计保持原样');
        return;
      }
      if (!migrateTargetId) {
        message.warning('请选择迁移目标分类');
        return;
      }
      await removeCategoryWithMigration(deleting.id, migrateTargetId);
      message.success(`已迁移 ${count} 条记录并删除该分类`);
    } else {
      await removeCategory(deleting.id);
      message.success('已删除该分类');
    }
    setDeleting(null);
    await refreshCounts();
  };

  const openDelete = (category: Category) => {
    setDeleting(category);
    setMigrateTargetId(null);
    setDeleteMode('migrate');
  };

  const columns: ColumnsType<Category> = [
    {
      title: '分类名称',
      dataIndex: 'name',
      render: (name: string, record) => (
        <Space size={4} wrap>
          <span>{name}</span>
          {record.builtin && <Tag>内置</Tag>}
          {isCoreBuiltin(record) && <Tag color="blue">核心</Tag>}
          {record.disabled && <Tag>已停用</Tag>}
        </Space>
      ),
    },
    { title: '方向', dataIndex: 'direction', width: 80, render: (d) => (d === 'expense' ? '支出' : '收入') },
    {
      title: '收支记录',
      width: 100,
      render: (_, record) => `${recordCounts[record.id] ?? 0} 条`,
    },
    {
      title: '操作',
      width: 280,
      render: (_, record) => (
        <Space size={8} wrap>
          <a
            onClick={() => {
              setRenaming(record);
              setRenameValue(record.name);
              setRenameError(null);
            }}
          >
            重命名
          </a>
          {canDisableCategory(record) ? (
            <a onClick={() => void setDisabled(record.id, !record.disabled)}>
              {record.disabled ? '启用' : '停用'}
            </a>
          ) : (
            <Tooltip title="核心内置分类不可停用">
              <Typography.Text type="secondary" style={{ cursor: 'not-allowed' }}>
                停用
              </Typography.Text>
            </Tooltip>
          )}
          {canDeleteCategory(record) ? (
            <a style={{ color: '#ff4d4f' }} onClick={() => openDelete(record)}>
              删除
            </a>
          ) : (
            <Tooltip title="内置分类不可删除">
              <Typography.Text type="secondary" style={{ cursor: 'not-allowed' }}>
                删除
              </Typography.Text>
            </Tooltip>
          )}
          {/* 恢复默认名称（05 §7.3）：仅内置分类且改过名时提供 */}
          {record.builtin && record.defaultName && record.name !== record.defaultName && (
            <a onClick={() => void updateCategory(record.id, { name: record.defaultName })}>
              恢复默认名称
            </a>
          )}
        </Space>
      ),
    },
  ];

  const deletingCount = deleting ? (recordCounts[deleting.id] ?? 0) : 0;
  const candidates = deleting ? migrationCandidates(categories, deleting) : [];

  return (
    <div>
      <Space style={{ marginBottom: 8 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
          新增分类
        </Button>
        <Typography.Text type="secondary">
          核心内置分类不可删除、不可停用；停用仅隐藏选择列表，历史记录与统计不受影响
        </Typography.Text>
      </Space>

      {(['expense', 'income'] as const).map((direction) => (
        <div key={direction} style={{ marginBottom: 16 }}>
          <Typography.Title level={5}>{direction === 'expense' ? '支出分类' : '收入分类'}</Typography.Title>
          <Table<Category>
            rowKey="id"
            size="small"
            pagination={false}
            columns={columns}
            dataSource={categories.filter((c) => c.direction === direction)}
          />
        </div>
      ))}

      {/* 新增分类（05 §3.1） */}
      <Modal
        title="新增分类"
        open={addOpen}
        onOk={() => void handleAdd()}
        onCancel={() => setAddOpen(false)}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <Typography.Text strong>分类名称（1～{CATEGORY_NAME_MAX} 字）</Typography.Text>
            <Input
              value={addName}
              maxLength={CATEGORY_NAME_MAX}
              onChange={(e) => {
                setAddName(e.target.value);
                setAddError(null);
              }}
              placeholder="如：社团活动"
            />
            {addError && <Typography.Text type="danger">{addError}</Typography.Text>}
          </div>
          <div>
            <Typography.Text strong>适用方向（创建后不可更改）</Typography.Text>
            <div>
              <Segmented
                value={addDirection}
                onChange={(v) => setAddDirection(v as 'expense' | 'income')}
                options={[
                  { label: '支出', value: 'expense' },
                  { label: '收入', value: 'income' },
                ]}
              />
            </div>
          </div>
          <Typography.Text type="secondary">
            新分类创建后立即可用于记账、预算设置与统计，不影响任何已有记录（05 §3.1）。
          </Typography.Text>
        </Space>
      </Modal>

      {/* 重命名（05 §3.2） */}
      <Modal
        title={renaming ? `重命名「${renaming.name}」` : ''}
        open={!!renaming}
        onOk={() => void handleRename()}
        onCancel={() => setRenaming(null)}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Input
            value={renameValue}
            maxLength={CATEGORY_NAME_MAX}
            onChange={(e) => {
              setRenameValue(e.target.value);
              setRenameError(null);
            }}
          />
          {renameError && <Typography.Text type="danger">{renameError}</Typography.Text>}
          <Typography.Text type="secondary">
            重命名只改名称展示：历史记录、统计图、预算设置中的名称同步更新，金额等数据不变（05 §3.2）。
          </Typography.Text>
        </Space>
      </Modal>

      {/* 删除（05 §3.3）：无记录可直接删；有记录须迁移后删除或改用停用 */}
      <Modal
        title={deleting ? `删除分类「${deleting.name}」？` : ''}
        open={!!deleting}
        onOk={() => void handleDeleteConfirm()}
        onCancel={() => setDeleting(null)}
        okText={deletingCount > 0 && deleteMode === 'disable' ? '停用' : '确认'}
        okButtonProps={deletingCount > 0 && deleteMode === 'disable' ? { danger: false } : { danger: true }}
        cancelText="取消"
        destroyOnClose
      >
        {deletingCount === 0 ? (
          <Typography.Paragraph>
            该分类下无收支记录，可直接删除。删除后该分类从选择列表消失；该分类在各周期上已设置的分类预算一并移除，周期本身与总预算不受影响（05 §3.3）。
          </Typography.Paragraph>
        ) : (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Typography.Text type="warning">
              该分类下有 {deletingCount} 条收支记录，不能直接删除。请选择处理方式：
            </Typography.Text>
            <Segmented
              value={deleteMode}
              onChange={(v) => setDeleteMode(v as 'migrate' | 'disable')}
              options={[
                { label: '迁移后删除', value: 'migrate' },
                { label: '改用停用', value: 'disable' },
              ]}
            />
            {deleteMode === 'migrate' ? (
              <>
                <div>
                  <Typography.Text>迁移目标分类（同方向）：</Typography.Text>
                  <Select
                    style={{ width: '100%', marginTop: 4 }}
                    placeholder="选择目标分类"
                    value={migrateTargetId}
                    onChange={setMigrateTargetId}
                    options={candidates.map((c) => ({
                      value: c.id,
                      label: c.name + (c.disabled ? '（已停用）' : ''),
                    }))}
                  />
                </div>
                {migrateTargetId && (
                  <Typography.Text type="warning">
                    预览：{deletingCount} 条记录将改归「
                    {candidates.find((c) => c.id === migrateTargetId)?.name}」，随后删除该分类；
                    其分类预算设置一并移除。记录的金额、日期、方向、备注不变（05 §3.3/§7.2）。
                  </Typography.Text>
                )}
              </>
            ) : (
              <Typography.Paragraph>
                不删除分类，仅停用：从记账与预算设置的选择列表隐藏，历史记录与统计保持原样（05 §3.4）。
              </Typography.Paragraph>
            )}
          </Space>
        )}
      </Modal>
    </div>
  );
}
