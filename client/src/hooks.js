import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

export const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

function parseHash() {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [path, query = ''] = raw.split('?');
  return { path, params: new URLSearchParams(query) };
}

export function useHashRoute() {
  const [route, setRoute] = useState(parseHash);
  useEffect(() => {
    const update = () => setRoute(parseHash());
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  return route;
}

export const navigate = path => { window.location.hash = path; };

export function useDebounced(value, delay) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

const EMPTY = { data: null, error: null, loading: false, stale: false, updatedAt: null };

// Loads data for `key`, refreshing quietly each time `tick` changes. A quiet refresh keeps the
// current data on a passing failure (marked stale) so live updates never blank the page.
export function useResource(load, key, tick = 0, { keepData = false } = {}) {
  const [state, setState] = useState({ ...EMPTY, loading: key !== null });
  const loader = useRef(load);
  loader.current = load;
  const active = useRef(null);
  const lastTick = useRef(tick);

  const run = useCallback(async quiet => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    if (!quiet) setState(current => ({ ...current, loading: true, error: null }));
    try {
      const data = await loader.current(controller.signal);
      if (controller.signal.aborted) return;
      setState({ data, error: null, loading: false, stale: false, updatedAt: new Date() });
    } catch (error) {
      if (controller.signal.aborted) return;
      const gone = error.status === 403 || error.status === 404;
      setState(current => (quiet && current.data && !gone
        ? { ...current, loading: false, stale: true }
        : { ...EMPTY, error }));
    }
  }, []);

  useEffect(() => {
    if (key === null) {
      setState(EMPTY);
      return undefined;
    }
    if (!keepData) setState({ ...EMPTY, loading: true });
    run(false);
    return () => active.current?.abort();
  }, [key, keepData, run]);

  useEffect(() => {
    if (tick === lastTick.current) return;
    lastTick.current = tick;
    if (key !== null) run(true);
  }, [tick, key, run]);

  return { ...state, reload: useCallback(() => run(true), [run]), retry: useCallback(() => run(false), [run]) };
}

// Runs one user action at a time and keeps its failure for display next to the control.
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const running = useRef(false);
  const run = useCallback(async action => {
    if (running.current) return false;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (failure) {
      setError(failure);
      return false;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, []);
  return { busy, error, run, clearError: useCallback(() => setError(null), []) };
}

// If an update removes the focused control, focus would fall to <body> and keyboard users would
// lose their place. Only in that case it moves to the page heading; live data never moves it otherwise.
export function useFocusRescue(containerRef) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    let last = null;
    const remember = event => { last = event.target; };
    const observer = new MutationObserver(() => {
      if (last && !last.isConnected && document.activeElement === document.body) {
        container.querySelector('h1')?.focus({ preventScroll: true });
      }
      if (last && !last.isConnected) last = null;
    });
    container.addEventListener('focusin', remember);
    observer.observe(container, { childList: true, subtree: true });
    return () => {
      container.removeEventListener('focusin', remember);
      observer.disconnect();
    };
  }, [containerRef]);
}
