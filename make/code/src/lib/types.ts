/**
 * 共享领域类型 —— 代码层映射。
 * 概念定义以 spec/01《产品定位与整体方案》第 5 章为唯一定义处，本文件只做代码映射、不重定义语义。
 * 金额一律使用整数（分）表示，见 src/lib/money.ts。
 */

/** 账户的资产类型（01 §5.1）：现金与活期 / 定期与理财产品 / 基金持仓；不含黄金等贵金属及另类资产 */
export type AssetType = 'cash' | 'fixed' | 'fund';

/** 账户（01 §5.1）：资金存放渠道的记账容器。当前余额不作为固有属性存储，取自最近一次资产快照。 */
export interface Account {
  id: string;
  name: string;
  assetType: AssetType;
  /** 是否计入总资产，默认计入（01 §5.1） */
  includeInTotal: boolean;
  note?: string;
  /** —— 定期与理财产品类专有（02 §2.6.2）—— */
  /** 本金（分），必填 */
  principalCents?: number;
  /** 存入/购买日期 YYYY-MM-DD，必填，不晚于当天 */
  purchaseDate?: string;
  /** 期限（天）；预置选项集 [TBD]，自定义天数 */
  termDays?: number;
  /** 到期日 YYYY-MM-DD = 存入日期 + 期限，可手动修改，不早于存入日期 */
  maturityDate?: string;
  /** 展示收益率（%，如 3.5 表示 3.5%），用户抄录，仅作参考展示，本产品不内置该数值 */
  displayRatePercent?: number | null;
  /** 风险等级（01 §5.7 五级标签），选填，可"不确定" */
  riskLevel?: RiskLevel | 'unknown' | null;
  /** —— 基金持仓类专有（02 §2.6.3）—— */
  /** 基金名称，选填 */
  fundName?: string;
  /** 软删除标记（02 §2.4.7：删除后收支记录仍需显示原账户名并附「已删除」标记） */
  deletedAt: string | null;
  /** 显示顺序（05 §4.3：默认按创建先后，用户可调整，仅影响展示顺序） */
  sortOrder?: number;
  createdAt: string;
  updatedAt: string;
}

/** 资产快照中单个账户的余额（分） */
export interface SnapshotEntry {
  accountId: string;
  balanceCents: number;
  /** 基金持仓方式 A 录入时保留份额与净值（02 §3.6） */
  units?: number | null;
  nav?: number | null;
}

/** 资产快照（01 §5.2）：某时刻各账户余额的时点记录 = 一个时间点 + 各账户余额 + 总资产 */
export interface AssetSnapshot {
  id: string;
  /** 快照时间（ISO 字符串），精确到分钟 */
  takenAt: string;
  entries: SnapshotEntry[];
  /** 总资产 = 计入统计的账户余额之和（分），保存时计算并固定（02 §3.6、§5.4.3） */
  totalCents: number;
  createdAt: string;
  /** 最后编辑时间（02 §3.4.5 编辑留痕），未编辑过为 null */
  updatedAt: string | null;
}

/** 收支方向（01 §5.3）：转账指账户之间的资金移动，不计入收支统计 */
export type TxDirection = 'income' | 'expense' | 'transfer';

/** 数据来源（01 §5.3） */
export type TxSource = 'manual' | 'alipay_csv' | 'wechat_csv' | 'bank_statement';

/** 收支记录（01 §5.3）：一笔资金进出事件的记录 */
export interface Transaction {
  id: string;
  /** 交易发生日期，YYYY-MM-DD */
  date: string;
  direction: TxDirection;
  /** 金额（分），保留到分 */
  amountCents: number;
  /** 分类：收入/支出记录必填；转账不参与分类统计，为 null（03 §2） */
  categoryId: string | null;
  /** 所属账户，选填 */
  accountId: string | null;
  /** 转账对方账户（仅 direction = 'transfer' 时使用） */
  counterAccountId: string | null;
  source: TxSource;
  memo?: string;
  /** 导入条目的原始描述（CSV 导入时留存，用于重复判定与追溯；02 §4.4.6） */
  originalMemo?: string;
  createdAt: string;
  updatedAt: string;
}

/** 分类（01 §5.4）：收入与支出两套独立体系，一级/二级层级 */
export interface Category {
  id: string;
  name: string;
  direction: 'income' | 'expense';
  /** 一级分类为 null */
  parentId: string | null;
  level: 1 | 2;
  /** 是否内置（内置清单见 03 §3.1/3.2） */
  builtin: boolean;
  /**
   * 核心内置标记，固化于种子创建时（05 §3.2"分类身份不变"、§3.4 核心内置不可停用）。
   * 可选以兼容旧数据（旧数据缺省时按名称兜底判定，见 categoryAdmin.isCoreBuiltin）。
   */
  core?: boolean;
  /** 内置分类的默认名称（05 §7.3 恢复默认名称用），自定义分类为 undefined */
  defaultName?: string;
  disabled: boolean;
  sortOrder: number;
}

/** CSV 导入分类映射规则（01 §5.4、02 §4.4.5）：描述包含关键词即归类 */
export interface MappingRule {
  id: string;
  /** 交易描述包含的关键词 */
  keyword: string;
  categoryId: string;
  builtin: boolean;
  enabled: boolean;
}

/** 分类预算金额（分） */
export interface CategoryBudget {
  categoryId: string;
  amountCents: number;
}

/** 预算（01 §5.5）：绑定在某个预算周期上的金额约束 */
export interface Budget {
  id: string;
  cycleType: 'month' | 'custom';
  /** 月度周期为 YYYY-MM；自定义周期为 CustomCycle 的 id */
  cycleKey: string;
  /** 总预算（分），null 表示未设置 */
  totalBudgetCents: number | null;
  categoryBudgets: CategoryBudget[];
  updatedAt: string;
}

/** 自定义预算周期（01 §5.5）：如学期，手动创建与结束 */
export interface CustomCycle {
  id: string;
  name: string;
  /** YYYY-MM-DD */
  startDate: string;
  /** YYYY-MM-DD */
  endDate: string;
  /** 用户手动结束标记 */
  ended: boolean;
  createdAt: string;
}

/** 储蓄目标状态（01 §5.6） */
export type GoalStatus = 'active' | 'achieved' | 'abandoned';

/** 储蓄目标（01 §5.6）：目标金额、截止日期与已储蓄金额构成的攒钱计划 */
export interface SavingsGoal {
  id: string;
  name: string;
  /** 目标金额（分） */
  targetCents: number;
  /** 截止日期 YYYY-MM-DD */
  deadline: string;
  status: GoalStatus;
  archived: boolean;
  /**
   * 关联账户（已储蓄金额自动取值）。
   * [TBD] 关联取值方案未定（01 §5.6），当前仅存关联账户列表，取值仍以存入/取出记录为准。
   */
  linkedAccountIds: string[];
  /** 备注，≤ 200 字（04 §2.3 [Assumption, TBD]） */
  note?: string;
  /** 达成日期 YYYY-MM-DD（触发达成的存入记录日期，04 §2.5），未达成为 null */
  achievedAt?: string | null;
  /** 放弃日期 YYYY-MM-DD（04 §2.5），未放弃为 null */
  abandonedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 储蓄目标的存入/取出记录（08 §2.2 S6） */
export interface GoalEntry {
  id: string;
  goalId: string;
  type: 'deposit' | 'withdraw';
  /** 金额（分） */
  amountCents: number;
  /** YYYY-MM-DD */
  date: string;
  memo?: string;
  createdAt: string;
}

/** 风险等级（01 §5.7）：低 / 中低 / 中 / 中高 / 高，对应 R1～R5 [映射细则 TBD] */
export type RiskLevel = 'low' | 'mediumLow' | 'medium' | 'mediumHigh' | 'high';

/** 风险测评结果（08 §2.2 S7） */
export interface RiskProfile {
  id: 'current';
  assessedAt: string | null;
  totalScore: number | null;
  riskLevel: RiskLevel | null;
  manuallyAdjusted: boolean;
  /** 最近一次手动调整时间（04 §3.5）；重测提交后随手动调整标记一并清除 */
  manuallyAdjustedAt?: string | null;
}

/** 用户偏好设置（08 §2.2 S8）。默认值见 src/lib/defaults.ts。 */
export interface AppSettings {
  id: 'current';
  /** 预警阈值（接近超支的百分比），默认 80，可调范围 50～95（05 §5.1 [Assumption, TBD]） */
  alertThresholdPct: number;
  /** 是否分级提醒，默认开（05 §5.1 [Assumption]） */
  gradedReminderEnabled: boolean;
  /** 定期备份提醒开关，默认开（08 §3.3 [Assumption, TBD]） */
  backupReminderEnabled: boolean;
  /** 备份提醒周期（天），默认 30（08 §3.3 [Assumption, TBD]） */
  backupReminderDays: number;
  /**
   * 顶部预警提示的关闭状态（03 §5.6）：key 为预警对象 key，
   * value 为「关闭日期|当时的梯度|当时所处周期 key」。重现行为由 bannerReappearRule 决定（05 §5.1）。
   */
  dismissedWarnings?: Record<string, string>;
  /**
   * 提示条关闭后的重现规则（05 §5.1 [Assumption, TBD]）：
   * A = 本周期内梯度升级时重现；B = 次日重新评估（默认，与 03 §5.6 一致）；C = 本周期内不再重现。
   */
  bannerReappearRule: BannerReappearRule;
}

/** 提示条关闭后的重现规则选项（05 §5.1） */
export type BannerReappearRule = 'A' | 'B' | 'C';

/** 应用状态记录（08 §2.2 S9）：告知与声明的确认状态、备份时间 */
export interface AppMeta {
  id: 'current';
  /** 首次使用告知确认时间（08 §7） */
  firstUseNoticeAckAt: string | null;
  /** 配置教育模块声明确认时间（04 §5.5） */
  educationDisclaimerAckAt: string | null;
  /** 股票模块声明确认时间（06 §6.2，二期） */
  stockDisclaimerAckAt: string | null;
  /** 银行信息库声明确认时间（07 §6.2，二期） */
  bankDisclaimerAckAt: string | null;
  /** 最近一次备份导出时间（08 §3.3） */
  lastBackupExportAt: string | null;
  /** 最近一次点击"关闭本次提醒"的时间（08 §3.3）：下个提醒周期到达后再次提醒 */
  backupReminderDismissedAt?: string | null;
}
