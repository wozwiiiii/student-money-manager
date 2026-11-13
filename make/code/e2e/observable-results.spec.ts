import { expect, test } from '@playwright/test';

/**
 * 01 §1.4 可观察预期结果逐条核对（结果 1/3/4/5；结果 2/6/7 由 critical-path.spec.ts 覆盖）。
 * 注意：AntD Button 对两字按钮自动插空格（"保存"渲染为"保 存"），用 /^保\s*存$/ 正则匹配。
 */

/** 确认首次使用告知层（每个测试为全新 context） */
async function ackFirstNotice(page: import('@playwright/test').Page) {
  // 应用壳渲染后告知层才会异步出现（AppLayout 加载 AppMeta），先等壳再等遮罩，避免时序竞态
  await page.getByText('校园理财管家').first().waitFor();
  const confirmBtn = page.getByRole('button', { name: '我已知晓，开始使用' });
  if (await confirmBtn.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true, () => false)) {
    await confirmBtn.click();
    await expect(page.getByText('使用前须知')).toBeHidden();
  }
}

test('结果 1：登记 2 个账户 + 2 次快照后，资产总览展示资产趋势图', async ({ page }) => {
  await page.goto('/#/accounts');
  await ackFirstNotice(page);

  for (const name of ['余额宝', '银行卡']) {
    await page.getByRole('button', { name: '添加账户' }).first().click();
    const modal = page.locator('.ant-modal-content');
    // 账户名称为 AutoComplete：placeholder 渲染为提示文本而非 input 属性，需定位其搜索 input；
    // fill 赋值不会触发 rc-select 的 onChange，改用逐键输入。不可按 Escape 收起下拉——
    // Escape 会冒泡到 Modal（keyboard 监听）直接关闭弹窗，保存将失效
    const nameInput = modal.locator('.ant-select-selection-search-input').first();
    await nameInput.click();
    await page.keyboard.type(name);
    await modal.getByRole('button', { name: /^保\s*存$/ }).click();
  }

  await page.goto('/#/overview');
  // 第一次快照：时间改为昨天（补录场景，02 §3.4.3）
  await page.getByRole('button', { name: '更新快照' }).click();
  let modal = page.locator('.ant-modal-content');
  await modal.getByPlaceholder('余额').first().fill('100');
  await modal.getByPlaceholder('余额').nth(1).fill('500');
  // 带时间的 DatePicker：fill/键入文本均不会提交值（时间会保持"现在"→ 与第二条同分钟冲突），
  // 必须在面板中点选日期单元格（title=YYYY-MM-DD）后点「确定」提交
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  await modal.locator('.ant-picker input').first().click();
  await page.locator(`.ant-picker-cell[title="${yesterday}"]`).click();
  await page.locator('.ant-picker-ok button').click();
  await modal.getByRole('button', { name: '保存快照' }).click();

  // 第二次快照：默认当前时间，余额小幅变化（避免 ±50% 确认）
  await page.getByRole('button', { name: '更新快照' }).click();
  modal = page.locator('.ant-modal-content');
  await modal.getByPlaceholder('余额').first().fill('120');
  await modal.getByPlaceholder('余额').nth(1).fill('520');
  await modal.getByRole('button', { name: '保存快照' }).click();

  // 趋势图（ECharts canvas）出现；标题用精确匹配，避免与空态文案互相干扰
  await expect(page.getByText('资产趋势', { exact: true })).toBeVisible();
  await expect(page.locator('canvas').first()).toBeVisible();
});

test('结果 3：月度与自定义周期两套预算视图可切换', async ({ page }) => {
  await page.goto('/#/transactions');
  await ackFirstNotice(page);

  // 月度视图：设置预算
  await page.getByRole('button', { name: '设置预算' }).first().click();
  let modal = page.locator('.ant-modal-content');
  await modal.getByPlaceholder('可留空，仅设分类预算').fill('500');
  await modal.getByRole('button', { name: /^保\s*存$/ }).click();
  await expect(page.getByText(/总预算/).first()).toBeVisible();

  // 创建自定义周期（起止日期必填，03 §4.2）；周期切换 Segmented 只列"月度"与已创建周期
  await page.getByRole('button', { name: '新建周期' }).click();
  modal = page.locator('.ant-modal-content');
  await modal.getByPlaceholder('如「秋季学期」').fill('本学期');
  const cycleInputs = modal.locator('.ant-picker input');
  await cycleInputs.nth(0).fill(new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10));
  await cycleInputs.nth(0).press('Enter');
  await cycleInputs.nth(1).fill(new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10));
  await cycleInputs.nth(1).press('Enter');
  await modal.getByRole('button', { name: /^保\s*存$/ }).click();
  // 切到新建的自定义周期视图并设置预算
  await page.getByText('本学期', { exact: true }).click();
  await page.getByRole('button', { name: '设置预算' }).first().click();
  modal = page.locator('.ant-modal-content');
  await modal.getByPlaceholder('可留空，仅设分类预算').fill('3000');
  await modal.getByRole('button', { name: /^保\s*存$/ }).click();
  await expect(page.getByText(/总预算/).first()).toBeVisible();

  // 切回月度视图：两套预算进度各自保留
  await page.getByText('月度', { exact: true }).click();
  await expect(page.getByText(/总预算/).first()).toBeVisible();
});

test('结果 4：储蓄目标卡片展示进度百分比与剩余天数', async ({ page }) => {
  await page.goto('/#/goals');
  await ackFirstNotice(page);

  await page.getByRole('button', { name: '新建目标' }).first().click();
  let modal = page.locator('.ant-modal-content');
  await modal.getByPlaceholder('如：换台笔记本').fill('换笔记本');
  await modal.getByPlaceholder('¥ 0.00').first().fill('3000');
  // 目标日期：明天（默认今天会显示"今日截止"，无"剩余 N 天"）
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  await modal.locator('.ant-picker input').first().fill(tomorrow);
  await modal.locator('.ant-picker input').first().press('Enter');
  await modal.getByRole('button', { name: /^保\s*存$/ }).click();

  // 记一笔存入 500 → 进度 16%（向下取整）+ 剩余天数
  await page.getByRole('button', { name: '记一笔存入' }).click();
  modal = page.locator('.ant-modal-content');
  await modal.getByPlaceholder('¥ 0.00').first().fill('500');
  await modal.getByRole('button', { name: /^保\s*存$/ }).click();

  await expect(page.getByText('换笔记本')).toBeVisible();
  await expect(page.getByText('剩余 1 天')).toBeVisible();
  await expect(page.getByText('16%')).toBeVisible();
});

test('结果 5：投资概念首现附浅白解释（货币基金、净值、定期理财）', async ({ page }) => {
  await page.goto('/#/education');
  await ackFirstNotice(page);

  // 配置教育页三类资产的浅白解释（04 §4.4 文案）
  await expect(page.getByText(/货币基金——主要投资短期存款/)).toBeVisible();
  await expect(page.getByText(/净值（每份基金单位的价格）/)).toBeVisible();
  await expect(page.getByText(/收益率是参考值而非承诺/)).toBeVisible();

  // 账户管理页资产类型的"这是什么？"解释入口可展开（分组头仅在有账户时渲染）
  await page.goto('/#/accounts');
  await page.getByRole('button', { name: '添加账户' }).first().click();
  const modal = page.locator('.ant-modal-content');
  const nameInput = modal.locator('.ant-select-selection-search-input').first();
  await nameInput.click();
  await page.keyboard.type('余额宝');
  await modal.getByRole('button', { name: /^保\s*存$/ }).click();
  await expect(page.getByText('余额宝').first()).toBeVisible();
  await page.getByText('这是什么？').first().click();
  await expect(page.locator('.ant-popover').first()).toBeVisible();
});
