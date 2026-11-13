import { expect, test } from '@playwright/test';

/**
 * 账号与云同步联调 E2E（阶段 8，08 §9）。
 * 依赖本地后端（FastAPI :8000，由 vite dev 代理 /api）；单测已覆盖 LWW 细节（src/lib/sync.test.ts、后端 pytest）。
 * 两字按钮注意：AntD 自动插空格（"登录"→"登 录"），用 /^登\s*录$/ 类正则。
 */

const BTN_LOGIN = /^登\s*录$/;
const BTN_REGISTER = /^注\s*册$/;

test('账号与云同步：注册 → 同步 → 退出 → 重新登录 → 注销', async ({ page }) => {
  // 随机标识保证可重复运行（注册唯一性）
  const identifier = `测试用户-${Date.now()}`;
  await page.goto('/#/settings');
  // 首次告知遮罩
  const confirmBtn = page.getByRole('button', { name: '我已知晓，开始使用' });
  if (await confirmBtn.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true, () => false)) {
    await confirmBtn.click();
    await expect(page.getByText('使用前须知')).toBeHidden();
  }

  const panel = page.locator('.ant-card', { hasText: '账号与云同步' });
  await expect(panel.getByText('未登录可完整使用全部功能')).toBeVisible();

  // —— 注册（08 §9.1：勾选同意 + 注册并同步）——
  await panel.getByRole('button', { name: BTN_REGISTER }).click();
  await panel.getByPlaceholder('用户名或邮箱').fill(identifier);
  await panel.getByPlaceholder('至少 8 位').fill('password123');
  await panel.getByRole('checkbox').check();
  await panel.getByRole('button', { name: '注册并同步' }).click();
  await expect(panel.getByText(`已登录：${identifier}`)).toBeVisible();
  await expect(panel.getByRole('button', { name: '立即同步' })).toBeVisible();

  // —— 立即同步（08 §9.2）——
  await panel.getByRole('button', { name: '立即同步' }).click();
  await expect(panel.getByText(/最近同步/)).toBeVisible();

  // —— 登出（08 §9.3：回到未登录表单）——
  await panel.getByRole('button', { name: '退出登录' }).click();
  await page.locator('.ant-modal-confirm').getByRole('button', { name: /退出登录|确\s*定|OK/ }).click();
  await expect(panel.getByText('未登录可完整使用全部功能')).toBeVisible();

  // —— 重新登录（08 §9.1 统一错误文案也在此路径覆盖）——
  await panel.getByRole('button', { name: BTN_LOGIN }).click();
  await panel.getByPlaceholder('用户名或邮箱').fill(identifier);
  await panel.getByPlaceholder('至少 8 位').fill('password123');
  await panel.getByRole('button', { name: '登录并同步' }).click();
  await expect(panel.getByText(`已登录：${identifier}`)).toBeVisible();

  // —— 错误密码：统一文案（08 §9.1 防账号枚举）——
  await panel.getByRole('button', { name: '退出登录' }).click();
  await page.locator('.ant-modal-confirm').getByRole('button', { name: /退出登录|确\s*定|OK/ }).click();
  // 等待登出完成、表单就绪（否则与上一次成功提交的输入清理竞态）
  await expect(panel.getByText('未登录可完整使用全部功能')).toBeVisible();
  await panel.getByPlaceholder('用户名或邮箱').fill(identifier);
  await panel.getByPlaceholder('至少 8 位').fill('wrong-pass');
  await panel.getByRole('button', { name: '登录并同步' }).click();
  // 后端统一文案"登录标识或密码错误"（08 §9.1 防账号枚举）
  await expect(page.getByText('登录标识或密码错误')).toBeVisible();

  // —— 注销账号（08 §9.4：删除账号与云端副本，二次确认）——
  await panel.getByPlaceholder('至少 8 位').fill('password123');
  await panel.getByRole('button', { name: '登录并同步' }).click();
  await expect(panel.getByText(`已登录：${identifier}`)).toBeVisible();
  await panel.getByRole('button', { name: '注销账号' }).click();
  await page.locator('.ant-modal-confirm').getByRole('button', { name: /注销账号|确\s*定|OK/ }).click();
  await expect(panel.getByText('未登录可完整使用全部功能')).toBeVisible();
});
