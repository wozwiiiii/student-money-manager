import { useState } from 'react';
import { Alert, Button, Input, Modal, Space, Typography, message } from 'antd';
import { useSyncStore } from '@/stores/useSyncStore';
import { SyncApiError } from '@/lib/syncApi';

/**
 * 账号与云同步区（08 §9）：注册 / 登录 / 登出 / 注销 + 手动立即同步。
 * - 未登录可完整使用全部功能（08 §9.5），登录为可选增强
 * - 收集范围仅登录标识与密码，密码仅存加盐哈希（08 §2.6）
 * - 用户协议与隐私政策文本 [TBD-15] 待定稿，当前同意对象为隐私说明页
 */
export default function AccountSyncPanel() {
  const { identifier, syncing, lastSyncAt, lastError, register, login, logout, deleteAccount, syncNow } =
    useSyncStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [idValue, setIdValue] = useState('');
  const [password, setPassword] = useState('');
  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!idValue.trim() || !password) {
      message.warning('请填写登录标识与密码');
      return;
    }
    if (mode === 'register' && !agree) {
      message.warning('注册需先同意隐私说明');
      return;
    }
    setSubmitting(true);
    try {
      if (mode === 'register') {
        await register(idValue.trim(), password);
        message.success('注册成功，已开始同步');
      } else {
        await login(idValue.trim(), password);
        message.success('登录成功，已开始同步');
      }
      setIdValue('');
      setPassword('');
      setAgree(false);
    } catch (e) {
      message.error(e instanceof SyncApiError ? e.message : '网络异常，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = () => {
    Modal.confirm({
      title: '退出登录？',
      content: '退出仅清除本机登录态：本机数据与云端数据均保留，之后回到未登录模式（08 §9.3）。',
      okText: '退出登录',
      cancelText: '取消',
      onOk: async () => {
        await logout();
        message.success('已退出登录');
      },
    });
  };

  const handleDeleteAccount = () => {
    Modal.confirm({
      title: '注销账号？',
      content:
        '将删除你的账号与云端全部数据副本，不可恢复；本机数据不受影响。若本机数据需要保留，建议先导出备份（08 §9.4）。',
      okText: '注销账号',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteAccount();
          message.success('账号已注销');
        } catch (e) {
          message.error(e instanceof SyncApiError ? e.message : '网络异常，请稍后重试');
        }
      },
    });
  };

  return (
    <div>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Typography.Text type="secondary">
          未登录可完整使用全部功能；登录后数据同步至本应用服务端、支持多端使用。
          仅收集登录标识与密码（密码加密存储，我们无法得知你的密码），不收集手机号、身份证等身份信息。
        </Typography.Text>

        {identifier ? (
          <>
            <div>
              <Space wrap>
                <Typography.Text strong>已登录：{identifier}</Typography.Text>
                <Typography.Text type="secondary">
                  {syncing ? '同步中…' : lastSyncAt ? `最近同步：${lastSyncAt.slice(0, 16).replace('T', ' ')}` : '尚未同步'}
                </Typography.Text>
              </Space>
            </div>
            {lastError && <Alert type="warning" showIcon message={lastError} />}
            <Space wrap>
              <Button type="primary" loading={syncing} onClick={() => void syncNow()}>
                立即同步
              </Button>
              <Button onClick={handleLogout}>退出登录</Button>
              <Button danger onClick={handleDeleteAccount}>
                注销账号
              </Button>
            </Space>
            <Typography.Text type="secondary">
              同步为后台增量合并（较新记录保留）；同步失败不影响本机数据，将在下次打开时重试（08 §9.2）。
            </Typography.Text>
          </>
        ) : (
          <>
            <Space>
              <Button type={mode === 'login' ? 'primary' : 'default'} onClick={() => setMode('login')}>
                登录
              </Button>
              <Button type={mode === 'register' ? 'primary' : 'default'} onClick={() => setMode('register')}>
                注册
              </Button>
            </Space>
            <div>
              <Typography.Text>登录标识（用户名或邮箱）</Typography.Text>
              <Input
                value={idValue}
                onChange={(e) => setIdValue(e.target.value)}
                placeholder="用户名或邮箱"
                maxLength={254}
              />
            </div>
            <div>
              <Typography.Text>密码（至少 8 位）</Typography.Text>
              <Input.Password
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 8 位"
                maxLength={64}
              />
            </div>
            {mode === 'register' && (
              <label>
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> 我已阅读并同意
                <a onClick={() => window.open('#/privacy', '_blank')}>隐私说明</a>
              </label>
            )}
            <div>
              <Button type="primary" loading={submitting} onClick={() => void submit()}>
                {mode === 'register' ? '注册并同步' : '登录并同步'}
              </Button>
            </div>
            <Typography.Text type="secondary">
              本机已有数据时，登录后将与云端合并（较新记录保留，08 §9.2）；建议先导出备份。忘记密码目前只能重新注册（找回功能 [TBD]）。
            </Typography.Text>
          </>
        )}
      </Space>
    </div>
  );
}
