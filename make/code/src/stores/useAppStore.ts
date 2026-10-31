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
  saveRiskProfile: async (patch) => {
    const current = await riskProfileRepo.get();
    if (!current) return;
    const next = { ...current, ...patch };
    await riskProfileRepo.save(next);
    set({ riskProfile: next });
  },
}));
