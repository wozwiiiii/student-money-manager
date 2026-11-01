import { useAppStore } from './useAppStore';
import { useAssetsStore } from './useAssetsStore';
import { useBudgetsStore } from './useBudgetsStore';
import { useCategoriesStore } from './useCategoriesStore';
import { useGoalsStore } from './useGoalsStore';
import { useTransactionsStore } from './useTransactionsStore';

/** 数据整体替换（导入恢复 08 §3.2 / 清空 08 §2.5）后刷新全部 store，页面数据即时刷新 */
export async function reloadAllStores(): Promise<void> {
  await Promise.all([
    useAppStore.getState().load(),
    useAssetsStore.getState().load(),
    useBudgetsStore.getState().load(),
    useCategoriesStore.getState().load(),
    useGoalsStore.getState().load(),
    useTransactionsStore.getState().load(),
  ]);
}
