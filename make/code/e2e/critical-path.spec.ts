import { expect, test } from '@playwright/test';

/**
 * 关键路径 E2E（AGENT.md §5.4）：首次告知 → 记一笔 → 预算超支提示 → 导入账单 CSV → 导出备份 → 清空 → 恢复备份。
 * 同时覆盖 01 §1.4 可观察结果 2（CSV 导入入占比图、未匹配单独提示）、6（超支提示条）、7（首次告知三要点）。
 *
 * 注意：AntD Button 对恰好两个汉字的按钮自动插入空格（"保存"渲染为"保 存"），
 * 两字按钮一律用 /^保\s*存$/ 类正则匹配 accessible name。
 */
const BTN_SAVE = /^保\s*存$/;
const BTN_CONTINUE = /^继\s*续$/;
const BTN_RESTORE = /^恢\s*复$/;
const BTN_DONE = /^完\s*成$/;

test('关键路径：首次告知 → 记账 → 超支提示 → CSV 导入 → 备份导出/清空/恢复', async ({ page }) => {
  // —— 1. 首次使用告知层（结果 7：数据存本地 / 支持导出备份 / 不支持云同步）——
  await page.goto('/');
  await expect(page.getByText('使用前须知')).toBeVisible();
  await expect(page.getByText('保存在当前浏览器的本地空间')).toBeVisible();
  await expect(page.getByText('不支持多端云同步')).toBeVisible();
  await expect(page.getByText(/导出入口位于设置页/)).toBeVisible();
  // 查看完整说明 ≠ 确认：抽屉打开后告知层仍在
  await page.getByRole('button', { name: '查看完整隐私说明' }).click();
  await expect(page.getByText('完整隐私说明', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText('使用前须知')).toBeVisible();
  await page.getByRole('button', { name: '我已知晓，开始使用' }).click();
  await expect(page.getByText('使用前须知')).toBeHidden();

  // —— 2. 记一笔 ¥20 支出（分类：餐饮）——
  await page.goto('/#/transactions');
  await page.getByRole('button', { name: '记一笔' }).first().click();
  const txModal = page.locator('.ant-modal-content');
  await txModal.getByPlaceholder('¥ 0.00').fill('20');
  await txModal.getByText('餐饮', { exact: true }).click();
  await txModal.getByRole('button', { name: BTN_SAVE }).click();
  await expect(page.getByText(/20\.00/).first()).toBeVisible();

  // —— 3. 设置本月总预算 10 元 → 记一笔后触发超支提示（结果 6）——
  await page.getByRole('button', { name: '设置预算' }).first().click();
  const budgetModal = page.locator('.ant-modal-content');
  await budgetModal.getByPlaceholder('可留空，仅设分类预算').fill('10');
  await budgetModal.getByRole('button', { name: BTN_SAVE }).click();
  // 顶部提示条：总预算已超支（03 §5.4）
  await expect(page.getByText(/预算已超支/)).toBeVisible();

  // —— 4. 导入账单 CSV（结果 2）——
  await page.getByRole('button', { name: '导入账单' }).first().click();
  await page.locator('input[type="file"]').setInputFiles('e2e/fixtures/alipay-sample.csv');
  // 预览步：未匹配的行单独提示（未分类 N），自动匹配的行分类已带出
  await expect(page.getByText(/未分类/).first()).toBeVisible();
  await page.getByRole('button', { name: /确认导入/ }).click();
  await page.getByRole('button', { name: BTN_DONE }).click();
  // 导入数据进入收支列表（CSV 商品说明"午饭"）；占比图随数据渲染（canvas）
  await expect(page.getByText('午饭')).toBeVisible();
  await expect(page.locator('canvas').first()).toBeVisible();

  // —— 5. 导出备份文件（08 §3.1）——
  await page.goto('/#/settings');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出备份文件' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('校园理财管家-备份');
  await expect(page.getByText(/备份文件包含你的全部数据/)).toBeVisible();

  // —— 6. 清空全部数据（08 §2.5：双确认 + 告知层重现）——
  await page.getByRole('button', { name: '清空全部数据' }).click();
  await expect(
    page.locator('.ant-modal-content').getByText('将删除本应用在你浏览器中的全部数据'),
  ).toBeVisible();
  await page.getByRole('button', { name: BTN_CONTINUE }).click();
  await page.getByRole('button', { name: '删除全部数据' }).click();
  await expect(page.getByText('使用前须知')).toBeVisible();

  // —— 7. 从备份文件恢复（08 §3.2：本地为空直接恢复）——
  await page.getByRole('button', { name: '我已知晓，开始使用' }).click();
  await page.goto('/#/settings');
  await page.locator('input[type="file"]').setInputFiles(await download.path());
  await expect(page.getByText('备份生成日期')).toBeVisible();
  await page.getByRole('button', { name: BTN_RESTORE }).click();
  await expect(page.getByText(/恢复完成/)).toBeVisible();
  // 数据回来了：导入的 CSV 记录恢复
  await page.goto('/#/transactions');
  await expect(page.getByText('午饭')).toBeVisible();
});
