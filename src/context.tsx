import { createContext, useContext } from 'react';

import type {
  DemoCase,
  EvidenceRef,
  MetricKey,
  Report,
  Workspace,
  AccountUser,
} from '../shared/contracts';

import { type Locale } from './format';

export type Translate = (zh: string, en: string) => string;
export type ConfirmRequest = { title: string; text: string; action: () => Promise<void> };
export type AppContextValue = {
  locale: Locale;
  t: Translate;
  workspace: Workspace | null;
  cases: DemoCase[];
  user: AccountUser | null;
  registrationEnabled: boolean;
  passwordRecoveryEnabled?: boolean;
  refresh: () => Promise<void>;
  navigate: (path: string, options?: { replace?: boolean }) => void;
  execute: <T>(action: () => Promise<T>, success?: string) => Promise<T | undefined>;
  confirm: (request: ConfirmRequest) => void;
  showEvidence: (refs: EvidenceRef[], report?: Report) => void;
  busy: boolean;
  historyNavigation?: boolean;
};
export const AppContext = createContext<AppContextValue>(null!);
export const useApp = () => useContext(AppContext);
export const adjustments: MetricKey[] = [
  'inventoryAdjustment',
  'receivablesAdjustment',
  'payablesAdjustment',
  'otherAdjustments',
];
