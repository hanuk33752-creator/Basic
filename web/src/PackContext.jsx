import { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react';
import api from './api.js';

const PackContext = createContext(null);

export function PackProvider({ children }) {
  const [packs, setPacks] = useState([]);
  const [activePack, setActivePack] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const data = await api.listPacks();
    setPacks(data.packs);
    setActivePack(data.active);
    return data;
  }, []);

  useEffect(() => {
    refresh()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [refresh]);

  const value = useMemo(
    () => ({ packs, activePack, loading, refresh }),
    [packs, activePack, loading, refresh]
  );
  return <PackContext.Provider value={value}>{children}</PackContext.Provider>;
}

export function usePack() {
  const ctx = useContext(PackContext);
  if (!ctx) throw new Error('usePack must be used inside PackProvider');
  return ctx;
}
