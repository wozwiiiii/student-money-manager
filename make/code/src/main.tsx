import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { message } from 'antd';
import App from './App';
import { initDatabase } from '@/db/seed';
import { SAVE_FAILURE_SUGGESTIONS, SAVE_FAILURE_TEXT } from '@/lib/compliance';

/**
 * 容量不足的横切异常提示（08 §2.3）：任何保存因本地存储空间不足而失败时，
 * 统一提示权威文案与三条处理建议；已保存的历史数据不受影响。
 */
function isQuotaError(reason: unknown): boolean {
  return reason instanceof DOMException && reason.name === 'QuotaExceededError';
}

window.addEventListener('unhandledrejection', (event) => {
  if (isQuotaError(event.reason)) {
    message.error({
      content: `${SAVE_FAILURE_TEXT}。处理建议：${SAVE_FAILURE_SUGGESTIONS.join('；')}`,
      duration: 8,
    });
  }
});

async function bootstrap() {
  await initDatabase();
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <HashRouter>
        <App />
      </HashRouter>
    </React.StrictMode>,
  );
}

void bootstrap();
