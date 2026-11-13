/**
 * 同步触发调度（阶段 8）：store 写操作后调用 scheduleSync()，由 useSyncStore 注册的
 * 触发器去抖后执行全量 LWW 同步（08 §9.2"本地数据变更后后台自动推送"）。
 * 独立模块避免 stores ↔ syncStore 循环依赖。
 */
let trigger: (() => void) | null = null;

export function setSyncTrigger(fn: () => void): void {
  trigger = fn;
}

export function scheduleSync(): void {
  trigger?.();
}
