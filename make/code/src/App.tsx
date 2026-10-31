import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from '@/pages/AppLayout';
import OverviewPage from '@/pages/OverviewPage';
import AccountsPage from '@/pages/AccountsPage';
import TransactionsPage from '@/pages/TransactionsPage';
import BudgetPage from '@/pages/BudgetPage';
import GoalsPage from '@/pages/GoalsPage';
import SettingsPage from '@/pages/SettingsPage';

export default function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#2f7d5d',
          borderRadius: 8,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
        },
      }}
    >
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/overview" replace />} />
          <Route path="/overview" element={<OverviewPage />} />
          <Route path="/accounts" element={<AccountsPage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/budget" element={<BudgetPage />} />
          <Route path="/goals" element={<GoalsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </ConfigProvider>
  );
}
