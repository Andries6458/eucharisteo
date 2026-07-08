import AsyncStorage from '@react-native-async-storage/async-storage';

import { CurrencyCode, Holding, UserProfile } from '../types';
import { SEED_HOLDINGS, SEED_PROFILE } from '../data/seeds';

const KEYS = {
  holdings: '@fa/holdings/v1',
  profile: '@fa/profile/v1',
  baseCurrency: '@fa/baseCurrency/v1',
} as const;

/**
 * Local-first persistence layer. Every read falls back to seed data so the
 * app is fully usable offline in a standalone APK with no server running.
 */

export async function loadHoldings(): Promise<Holding[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.holdings);
    if (raw !== null) {
      const parsed = JSON.parse(raw) as Holding[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // Corrupt storage falls through to seeds.
  }
  await AsyncStorage.setItem(KEYS.holdings, JSON.stringify(SEED_HOLDINGS));
  return SEED_HOLDINGS;
}

export async function saveHoldings(holdings: Holding[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.holdings, JSON.stringify(holdings));
}

export async function loadProfile(): Promise<UserProfile> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.profile);
    if (raw !== null) {
      const parsed = JSON.parse(raw) as UserProfile;
      if (parsed && typeof parsed.annualIncome === 'number') return parsed;
    }
  } catch {
    // Corrupt storage falls through to seeds.
  }
  await AsyncStorage.setItem(KEYS.profile, JSON.stringify(SEED_PROFILE));
  return SEED_PROFILE;
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  await AsyncStorage.setItem(KEYS.profile, JSON.stringify(profile));
}

export async function loadBaseCurrency(): Promise<CurrencyCode> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.baseCurrency);
    if (raw === 'USD' || raw === 'ZAR' || raw === 'GBP') return raw;
  } catch {
    // Fall through to default.
  }
  return 'USD';
}

export async function saveBaseCurrency(code: CurrencyCode): Promise<void> {
  await AsyncStorage.setItem(KEYS.baseCurrency, code);
}
