import { useEffect, useState } from 'react';

const COALESCE_MS = 400;
const JITTER_MS = 800;
const MAX_BACKOFF_MS = 30000;

// Subscribes to /api/events and turns bursts of `change` events into one `tick`. Events carry no
// data; pages refetch what they show. The stream closes in hidden tabs, so many open tabs do not
// exhaust the browser's per-host connection limit, and it catches up when the tab returns.
export function useLiveTick(enabled) {
  const [tick, setTick] = useState(0);
  const [connection, setConnection] = useState('connecting');

  useEffect(() => {
    if (!enabled) return undefined;
    let source = null;
    let refreshTimer = null;
    let retryTimer = null;
    let failures = 0;
    let missedEvents = false;

    const scheduleRefresh = () => {
      if (refreshTimer !== null) return;
      // Jitter spreads refetches, so one change does not hit the server from every client at once.
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        setTick(value => value + 1);
      }, COALESCE_MS + Math.random() * JITTER_MS);
    };

    const close = () => {
      source?.close();
      source = null;
      clearTimeout(retryTimer);
      retryTimer = null;
    };

    const open = () => {
      if (source || document.hidden) return;
      source = new EventSource('/api/events');
      source.addEventListener('open', () => {
        failures = 0;
        setConnection('live');
        if (missedEvents) scheduleRefresh();
        missedEvents = false;
      });
      source.addEventListener('change', scheduleRefresh);
      source.addEventListener('error', () => {
        missedEvents = true;
        setConnection('reconnecting');
        if (source?.readyState !== EventSource.CLOSED) return; // The browser is retrying on its own.
        // A rejected stream does not retry itself. The refresh also detects an expired session.
        source = null;
        scheduleRefresh();
        failures += 1;
        const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** failures);
        retryTimer = setTimeout(open, delay * (0.5 + Math.random() / 2));
      });
    };

    const onVisibility = () => {
      if (document.hidden) {
        close();
        missedEvents = true;
      } else {
        open();
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    open();
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      clearTimeout(refreshTimer);
      close();
    };
  }, [enabled]);

  return { tick, connection };
}
