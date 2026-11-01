import { create } from 'zustand';
import { appMetaRepo, riskProfileRepo, settingsRepo } from '@/db/repositories';
import type { AppMeta, AppSettings, RiskProfile } from '@/lib/types';
import { nowIso } from '@/lib/ids';

/** 应用级状态（08 §2.2 S7/S8/S9）：风险测评、设置、告知与声明确认状态 */
interface AppState {
  settings: AppSettings | null;
  appMeta: AppMeta | null;
  riskProfile: RiskProfile | null;
  load: () => Promise<void>;
  saveSettings: (patch: Partial<Omit<AppSettings, 'id'>>) => Promise<void>;
  ackFirstUseNotice: () => Promise<void>;
  ackEducationDisclaimer: () => Promise<void>;
  markBackupExported: () => Promise<void>;
  /** 点击"关闭本次提醒"（08 §3.3）：仅消除当次提示条，不改变开关状态，下个提醒周期到达后再次提醒 */
  dismissBackupReminder: () => Promise<void>;
  saveRiskProfile: (patch: Partial<Omit<RiskProfile, 'id'>>) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  settings: null,
  appMeta: null,
  riskProfile: null,
  load: async () => {
    const [settings, appMeta, riskProfile] = await Promise.all([
      settingsRepo.get(),
      appMetaRepo.get(),
      riskProfileRepo.get(),
    ]);
    set({ settings, appMeta, riskProfile: riskProfile ?? null });
  },
  saveSettings: async (patch) => {
    const current = get().settings;
    if (!current) return;
    const next = { ...current, ...patch };
    await settingsRepo.save(next);
    set({ settings: next });
  },
  ackFirstUseNotice: async () => {
    const current = await appMetaRepo.get();
    const next: AppMeta = { ...current, firstUseNoticeAckAt: nowIso() };
    await appMetaRepo.save(next);
    set({ appMeta: next });
  },
  ackEducationDisclaimer: async () => {
    const current = await appMetaRepo.get();
    const next: AppMeta = { ...current, educationDisclaimerAckAt: nowIso() };
    await appMetaRepo.save(next);
    set({ appMeta: next });
  },
  markBackupExported: async () => {
    const current = await appMetaRepo.get();
    const next: AppMeta = { ...current, lastBackupExportAt: nowIso() };
    await appMetaRepo.save(next);
    set({ appMeta: next });
  },
  dismissBackupReminder: async () => {
    const current = await appMetaRepo.get();
    const next: AppMeta = { ...current, backupReminderDismissedAt: nowIso() };
    await appMetaRepo.save(next);
    set({ appMeta: next });
  },
  saveRiskProfile: async (patch) => {
    // 首次测评时记录尚不存在，允许创建（04 §3.5）
    const current = await riskProfileRepo.get();
    const next: RiskProfile = {
      id: 'current',
      assessedAt: null,
      totalScore: null,
      riskLevel: null,
      manuallyAdjusted: false,
      manuallyAdjustedAt: null,
      ...current,
      ...patch,
    };
    await riskProfileRepo.save(next);
    set({ riskProfile: next });
  },
}));
