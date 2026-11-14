# 校园理财管家（Campus Finance Keeper）

面向大学生的本地优先理财 Web 应用。通过手动录入与支付宝/微信账单 CSV 导入，把分散在微信、支付宝、银行各处的钱汇总成一张资产与收支视图，并提供匹配学期节奏的预算、储蓄目标与理财配置科普。

- **本地优先**：数据默认只存于浏览器 IndexedDB，支持备份文件导出/导入
- **账号可选**：阶段 8 起提供用户名/邮箱 + 密码注册登录与云同步；不登录也能完整使用
- **教育定位**：不接触真实资金、不提供交易入口，所有理财内容均为"教育性信息，不构成投资建议"

> 当前为开发中版本。P0（纯前端）七个开发阶段已完成；阶段 8（后端与云同步）功能已实现，线上部署方案尚未确定。

## 功能范围

已实现（P0 + 阶段 8）：

| 模块 | 页面 | 说明 |
|---|---|---|
| 资产总览 | `/overview` | 总资产、账户结构、资产趋势图（基于快照） |
| 账户与快照 | `/accounts` | 现金/活期、定期/理财、基金三类账户；快照录入与历史管理 |
| 收支与预算 | `/transactions`、`/budget` | 记一笔、CSV 导入向导、月度与自定义周期预算、超支预警、分类占比 |
| 储蓄目标 | `/goals` | 目标进度、剩余天数、节奏预测、存入/取出记录、逾期处理 |
| 配置教育 | `/education` | 风险测评问卷、五档配置示例、教育性声明常驻 |
| 设置 | `/settings` | 分类管理、预算规则、风险偏好、数据管理（备份/恢复/清空） |
| 数据与隐私 | `/privacy` | 隐私说明、首次使用告知 |

未实现（P1，仅需求文档）：股票分析、银行产品信息库。

## 技术栈

**前端**（`make/code`）

- React 18 + TypeScript（strict）+ Vite 5
- IndexedDB（Dexie 4）本地存储
- Ant Design 5 + ECharts 5（按需引入）
- Zustand 5 状态管理
- Vitest 单元测试 + Playwright E2E

**后端**（`make/server`，阶段 8）

- Python 3 + FastAPI + SQLAlchemy 2
- 生产数据库 PostgreSQL；开发默认 SQLite（`make/server/dev.db`）
- bcrypt 密码哈希、JWT 令牌（登出即刻作废）、记录级 LWW 云同步

## 目录结构

```
.
├── AGENT.md              # 开发准则：技术栈、开发原则、阶段计划、TBD 清单
├── README.md             # 本文件
├── spec/                 # 产品需求文档套件（01～08，需求唯一来源）
├── make/
│   ├── code/             # 前端 React 应用
│   │   ├── src/
│   │   │   ├── pages/        # 页面
│   │   │   ├── components/   # 组件
│   │   │   ├── db/           # Dexie schema、仓储、备份、种子数据
│   │   │   ├── lib/          # 纯逻辑：金额、预算、目标、CSV、同步等
│   │   │   └── stores/       # Zustand 状态
│   │   └── e2e/          # Playwright 用例
│   ├── server/           # 后端 FastAPI 应用
│   │   ├── app/          # 路由、模型、鉴权、同步
│   │   └── tests/        # pytest
│   └── test/             # 各阶段代码审查与测试文档
└── .gitignore
```

## 快速开始

### 前端

```bash
cd make/code
npm install
npm run dev          # 默认 http://localhost:5173
```

其他命令：

```bash
npm run build        # 类型检查 + 生产构建
npm run lint         # ESLint
npm test             # Vitest 单元测试
npm run test:e2e     # Playwright E2E（自动启动 4317 端口 dev server）
```

### 后端（阶段 8，账号与云同步）

```bash
cd make/server
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
# source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload    # http://localhost:8000
```

前端开发服务器已将 `/api` 代理到 `http://localhost:8000`（见 `make/code/vite.config.ts`）。

环境变量：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./dev.db` | 生产应注入 PostgreSQL 连接串（部署方案 [TBD-19]） |
| `JWT_SECRET` | `dev-only-secret-change-me-...` | **生产必须通过环境变量注入**，禁止使用默认值 |

现有接口：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| POST | `/api/auth/register` | 注册 |
| POST | `/api/auth/login` | 登录 |
| POST | `/api/auth/logout` | 登出（令牌即时作废） |
| DELETE | `/api/auth/me` | 注销账号并删除云端数据 |
| GET | `/api/sync/pull` | 拉取云端变更（记录级 LWW） |
| POST | `/api/sync/push` | 推送本地变更与删除墓碑 |

后端测试：

```bash
cd make/server
pytest
```

## 数据与合规

- **不接触真实资金**：界面无支付、转账、充值、提现、交易跳转入口，不索取支付宝/微信/银行账号、密码或验证码
- **数据最小化**：账号仅收集用户名/邮箱与密码（密码仅存加盐哈希），不收集姓名、手机号、身份证号
- **数据不出本地（默认）**：未登录时数据只存浏览器 IndexedDB；唯一主动离开浏览器的数据形态是用户导出的备份文件
- **不静默删除数据**：清空数据需二次确认，并提供先导出备份的路径
- **金额精度**：金额以整数（分）存储与计算，避免浮点误差
- **转账不计收支**：转账只改变资金位置，不计入收入/支出统计

## 文档

- [产品文档套件总目录](spec/README.md)：需求唯一来源，共享概念定义见 `spec/01` 第 5 章
- [AGENT.md](AGENT.md)：技术栈、开发原则、阶段计划与待定事项（TBD）清单
- `make/test/`：各阶段代码审查与测试记录

## 状态与待定事项

- P0 阶段 1～7（开发准则与骨架、资产汇总、收支与预算、储蓄目标与配置教育、自定义设置、备份与合规、测试验收）已完成
- 阶段 8：账号、云同步、前端接入已完成；以下事项仍待确定
  - 线上部署方案（服务器、域名、PostgreSQL 实例）[TBD-19]
  - 用户协议文本 [TBD-15]
  - 行情数据代理、数据分析服务（阶段 8 之后）

---

本项目为学习与个人开发用途。理财相关内容仅为教育性信息，不构成投资建议。
