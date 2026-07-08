import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { CurrencyCode, FxRates, Holding, UserProfile } from '../types';
import { getRatesSnapshot, subscribeToRates } from '../utils/fxEngine';
import {
  loadBaseCurrency,
  loadHoldings,
  loadProfile,
  saveBaseCurrency,
  saveHoldings,
  saveProfile,
} from '../storage/storage';
import { SEED_PROFILE } from '../data/seeds';

interface AppContextValue {
  ready: boolean;
  baseCurrency: CurrencyCode;
  setBaseCurrency: (code: CurrencyCode) => void;
  rates: FxRates;
  holdings: Holding[];
  addHolding: (holding: Omit<Holding, 'id'>) => void;
  removeHolding: (id: string) => void;
  profile: UserProfile;
  updateProfile: (profile: UserProfile) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `h-${Date.now().toString(36)}-${idCounter}`;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [baseCurrency, setBaseCurrencyState] = useState<CurrencyCode>('USD');
  const [rates, setRates] = useState<FxRates>(getRatesSnapshot);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [profile, setProfile] = useState<UserProfile>(SEED_PROFILE);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [storedCurrency, storedHoldings, storedProfile] =
        await Promise.all([loadBaseCurrency(), loadHoldings(), loadProfile()]);
      if (cancelled) return;
      setBaseCurrencyState(storedCurrency);
      setHoldings(storedHoldings);
      setProfile(storedProfile);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => subscribeToRates(setRates), []);

  const setBaseCurrency = useCallback((code: CurrencyCode) => {
    setBaseCurrencyState(code);
    void saveBaseCurrency(code);
  }, []);

  const addHolding = useCallback((holding: Omit<Holding, 'id'>) => {
    setHoldings((prev) => {
      const next = [{ ...holding, id: nextId() }, ...prev];
      void saveHoldings(next);
      return next;
    });
  }, []);

  const removeHolding = useCallback((id: string) => {
    setHoldings((prev) => {
      const next = prev.filter((h) => h.id !== id);
      void saveHoldings(next);
      return next;
    });
  }, []);

  const updateProfile = useCallback((next: UserProfile) => {
    setProfile(next);
    void saveProfile(next);
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      ready,
      baseCurrency,
      setBaseCurrency,
      rates,
      holdings,
      addHolding,
      removeHolding,
      profile,
      updateProfile,
    }),
    [
      ready,
      baseCurrency,
      setBaseCurrency,
      rates,
      holdings,
      addHolding,
      removeHolding,
      profile,
      updateProfile,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (ctx === null) {
    throw new Error('useApp must be used inside AppProvider');
  }
  return ctx;
}
