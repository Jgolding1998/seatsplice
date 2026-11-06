const boardChanges = new Set(['team_created', 'join_approved', 'invite_accepted', 'member_left', 'member_removed', 'team_deleted']);

export function createEvents(db, log = console) {
  const streams = new Set();
  const perUser = new Map();
  let watch;
  let retry;
  let stopped = false;
  let batchTimer;
  let boardTimer;
  const notified = new Set();

  function flush(all) {
    for (const stream of streams) {
      if (!all && !notified.has(stream.userId)) continue;
      if (!stream.response.write('event: change\ndata: {}\n\n')) stream.response.end();
    }
    notified.clear();
  }

  function publish(change) {
    const audit = change.fullDocument;
    for (const userId of audit.audience ?? []) notified.add(userId);
    if (!batchTimer) batchTimer = setTimeout(() => { batchTimer = null; flush(false); }, 175);
    if (boardChanges.has(audit.action) && !boardTimer) {
      boardTimer = setTimeout(() => { boardTimer = null; flush(true); }, 1100);
    }
  }

  function subscribe() {
    if (stopped) return;
    watch = db.audit.watch([{ $match: { operationType: 'insert' } }]);
    watch.on('change', publish);
    const active = watch;
    active.on('error', error => {
      if (stopped || watch !== active) return;
      watch = undefined;
      log.error('Live updates are reconnecting', { name: error.name, code: error.code });
      void active.close().catch(() => {});
      for (const stream of streams) stream.response.end();
      retry = setTimeout(subscribe, 1000 + Math.random() * 1000);
      retry.unref();
    });
  }
  subscribe();

  // Check revocations in one indexed query, independent of the number of browser tabs.
  let checking = false;
  let missedHeartbeats = 0;
  const heartbeat = setInterval(async () => {
    if (checking || !streams.size) return;
    checking = true;
    try {
      const snapshot = [...streams];
      const keys = [...new Set(snapshot.map(stream => stream.key))];
      const sessions = await db.sessions.find({ _id: { $in: keys }, expiresAt: { $gt: new Date() } }).toArray();
      missedHeartbeats = 0;
      const active = new Set(sessions.map(session => session._id));
      for (const stream of snapshot) {
        if (!streams.has(stream)) continue;
        if (!active.has(stream.key) || !stream.response.write(': heartbeat\n\n')) stream.response.end();
      }
    } catch (error) {
      log.error('Live session check failed', { name: error.name, code: error.code });
      if (++missedHeartbeats >= 2) for (const stream of streams) stream.response.end();
    } finally {
      checking = false;
    }
  }, 15000);
  heartbeat.unref();

  return {
    open(response, auth) {
      const userId = auth.user._id;
      if (streams.size >= 1500 || (perUser.get(userId) ?? 0) >= 4) return false;
      const stream = { response, userId, key: auth.key };
      streams.add(stream);
      perUser.set(userId, (perUser.get(userId) ?? 0) + 1);
      response.on('close', () => {
        streams.delete(stream);
        const remaining = perUser.get(userId) - 1;
        if (remaining) perUser.set(userId, remaining);
        else perUser.delete(userId);
      });
      response.set({
        'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive', 'X-Accel-Buffering': 'no'
      });
      response.flushHeaders();
      response.write(`retry: ${2500 + Math.floor(Math.random() * 2000)}\nevent: change\ndata: {}\n\n`);
      return true;
    },
    revoke(key) {
      for (const stream of streams) if (stream.key === key) stream.response.end();
    },
    async close() {
      stopped = true;
      clearTimeout(retry);
      clearTimeout(batchTimer);
      clearTimeout(boardTimer);
      clearInterval(heartbeat);
      for (const stream of streams) stream.response.end();
      await watch?.close();
    }
  };
}
