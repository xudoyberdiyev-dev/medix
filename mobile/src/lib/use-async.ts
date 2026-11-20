import { useCallback, useEffect, useRef, useState } from "react";

export type Async<T> = { data: T | undefined; error: unknown; loading: boolean; reload: () => Promise<void>; set: (v: T) => void };

/** Oddiy yuklash holati: maʼlumot / xato / yuklanmoqda + qayta yuklash. */
export function useAsync<T>(load: () => Promise<T>): Async<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const ref = useRef(load);
  ref.current = load;
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await ref.current());
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, error, loading, reload, set: setData };
}
