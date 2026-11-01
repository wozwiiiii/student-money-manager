import { Card } from 'antd';
import PrivacyContent from '@/components/PrivacyContent';

/** 隐私说明页（08 §4.3）：隐私承诺的唯一书面处，入口为设置页固定入口与首次使用告知层链接 */
export default function PrivacyPage() {
  return (
    <Card title="隐私说明">
      <PrivacyContent />
    </Card>
  );
}
