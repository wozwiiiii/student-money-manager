import { Typography } from 'antd';
import {
  DISCLAIMER_ANCHOR,
  GLOBAL_DISCLAIMER_FULL,
  SAVE_FAILURE_SUGGESTIONS,
  SAVE_FAILURE_TEXT,
} from '@/lib/compliance';

const { Title, Paragraph, Text } = Typography;

/**
 * 隐私说明内容（08 §4.3 内容要求清单，共 7 个内容模块）。
 * 供隐私说明页与首次使用告知层的"查看完整隐私说明"共用；
 * 产品的任何隐私承诺以本内容当前版本为准（08 §4.3 更新义务）。
 */
export default function PrivacyContent() {
  return (
    <div>
      <Title level={4}>1. 存储方式：数据只存你的浏览器本地</Title>
      <Paragraph>
        本应用无账号体系，不需要注册、登录或提供任何身份信息。你在本应用中录入、导入、产生的全部数据，
        仅保存于你当前使用的浏览器本地空间，不上传至任何服务器，不用于任何分析，不向任何第三方提供。
      </Paragraph>
      <Paragraph type="secondary">
        可观察含义：应用内没有任何「同步」「上传」操作；唯一离开浏览器的数据形态，是你主动导出并自行保存的备份文件。
        换一个浏览器或设备打开，看到的是空的首次使用状态——本地数据不跟随人走。
      </Paragraph>

      <Title level={4}>2. 如实边界：本地不等于绝对安全</Title>
      <Paragraph>
        <ul>
          <li>凡能使用该设备该浏览器的人，打开本应用即可看到全部数据；本应用无账号、无密码保护，无法对设备层面的安全负责。建议：为设备设置锁屏密码；不在共用设备上录入财务数据；离开设备前关闭页面。</li>
          <li>备份文件包含你的全部财务记录，谁拿到备份文件谁就能看到。建议：备份文件存放在仅自己可控的位置；不随意发送给他人；转存网盘时自行确认网盘账号安全。</li>
          <li>备注、目标名称等自由文本由你自行填写，产品无法禁止你在其中填写敏感信息。建议：请勿填写密码、证件号等敏感信息。</li>
        </ul>
      </Paragraph>

      <Title level={4}>3. 清除风险：这些情况会导致数据丢失</Title>
      <Paragraph>
        <ul>
          <li>清除浏览器数据（本站或全部）：本应用全部数据被一并删除、无法找回；有备份文件可导入恢复。</li>
          <li>换浏览器 / 换设备使用：数据不跟随，新环境是空的；迁移路径为旧环境导出备份 → 新环境导入。</li>
          <li>长期不使用：部分浏览器会自动清理长期未访问网站的本地数据；建议定期打开使用并保持备份。</li>
          <li>无痕 / 隐私模式：关闭无痕窗口后，期间录入的全部数据随之消失，无法保留。</li>
        </ul>
      </Paragraph>

      <Title level={4}>4. 备份建议：导出备份是唯一补救手段</Title>
      <Paragraph>
        导出入口位于设置页「数据管理」区，可随时导出包含全部数据的备份文件，由你自行保管。
        应用提供定期备份提醒（默认开启、周期 30 天，可在设置页调整或关闭）：长期未备份且期间有新数据时，
        会在页面顶部提示导出。备份责任在你：产品不代为保管、不自动备份到任何外部位置。
      </Paragraph>

      <Title level={4}>5. 存储内容清单</Title>
      <Paragraph>
        本地保存：账户、资产快照、收支记录、分类与映射规则、预算与周期、储蓄目标与存入记录、
        风险测评结果、设置项、应用状态记录（如声明确认状态、备份时间）。
      </Paragraph>
      <Paragraph type="secondary">
        不保存：无密码（无账号体系）；不收集姓名、手机号、身份证号等任何身份信息；
        不要求提供支付宝 / 微信 / 银行的账号、密码或验证码；不接入任何用户行为统计类外部服务。
      </Paragraph>

      <Title level={4}>6. 外部交互说明</Title>
      <Paragraph>
        打开本应用本身需要联网加载页面文件；这类交互获取的是应用运行所需的内容，方向是「向你的设备提供应用」，
        不涉及用户数据的发送。判断一项网络交互是否属于「数据上传」，以用户数据是否离开你的设备为唯一判据。
      </Paragraph>
      <Paragraph type="secondary">
        二期股票行情为「从外部数据源获取行情信息展示给你」，不属于上传用户数据；
        行情获取是否伴随发送与用户有关的信息待调研 [TBD]，上线前本页将同步更新外部交互说明。
      </Paragraph>

      <Title level={4}>7. 免责与定位：{DISCLAIMER_ANCHOR}</Title>
      <Paragraph strong>使用须知与免责声明</Paragraph>
      <ol>
        {GLOBAL_DISCLAIMER_FULL.map((line) => (
          <li key={line}>
            <Paragraph style={{ marginBottom: 4 }}>{line}</Paragraph>
          </li>
        ))}
      </ol>
      <Paragraph type="secondary">
        保存失败提示（本地存储空间不足时）：{SAVE_FAILURE_TEXT}；处理建议：{SAVE_FAILURE_SUGGESTIONS.join('；')}。
      </Paragraph>
      <Text type="secondary">
        以上内容为产品的隐私承诺与如实边界说明。二期引入行情数据源或任何第三方服务前，本页将先行更新。
      </Text>
    </div>
  );
}
