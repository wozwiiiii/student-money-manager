import { db } from './database';
import {
  buildBuiltinCategories,
  buildBuiltinMappingRules,
  DEFAULT_APP_META,
  DEFAULT_SETTINGS,
} from '@/lib/defaults';
import { newId, nowIso } from '@/lib/ids';
import type { RiskProfile } from '@/lib/types';

/**
 * 初始化数据库：写入内置默认数据（幂等）。
 * - 内置分类（03 §3.1/3.2）与内置映射规则（02 §4.4.5 示例表）：仅在分类表为空时写入
 * - 设置项、应用状态、风险测评占位行：不存在时补默认行
 * 分类/映射规则的修改属于用户操作（05 号文档），本函数只负责首次播种。
 */
export async function initDatabase(): Promise<void> {
  await db.transaction('rw', db.categories, db.mappingRules, db.settings, db.appMeta, db.riskProfile, async () => {
    const categoryCount = await db.categories.count();
    if (categoryCount === 0) {
      const categories = buildBuiltinCategories(newId, nowIso());
      await db.categories.bulkAdd(categories);
      const rules = buildBuiltinMappingRules(categories, newId);
      await db.mappingRules.bulkAdd(rules);
    }
    if (!(await db.settings.get('current'))) {
      await db.settings.add(DEFAULT_SETTINGS);
    }
    if (!(await db.appMeta.get('current'))) {
      await db.appMeta.add(DEFAULT_APP_META);
    }
    if (!(await db.riskProfile.get('current'))) {
      const riskProfile: RiskProfile = {
        id: 'current',
        assessedAt: null,
        totalScore: null,
        riskLevel: null,
        manuallyAdjusted: false,
      };
      await db.riskProfile.add(riskProfile);
    }
  });
}
