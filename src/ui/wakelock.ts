interface Sentinel {
  released: boolean;
  release(): Promise<void>;
}

export interface WakeDeps {
  api?: { request(type: 'screen'): Promise<Sentinel> };
  doc: EventTarget & { visibilityState: string };
}

export interface WakeLock {
  acquire(): void;
  release(): void;
}

const noop = (): void => {};

function browserDeps(): WakeDeps {
  const fallback = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  return {
    api: typeof navigator !== 'undefined' ? navigator.wakeLock : undefined,
    doc: typeof document !== 'undefined' ? document : fallback,
  };
}

export function createWakeLock(deps: WakeDeps = browserDeps()): WakeLock {
  let active = false;
  let pending = false;
  let sentinel: Sentinel | undefined;

  const free = (s: Sentinel): void => {
    try {
      void Promise.resolve(s.release()).catch(noop);
    } catch {
      /* schon frei */
    }
  };

  const request = (): void => {
    if (!deps.api || pending) return;
    pending = true;
    try {
      deps.api.request('screen').then(
        (s) => {
          pending = false;
          if (active) sentinel = s;
          else free(s);
        },
        () => {
          pending = false;
        },
      );
    } catch {
      pending = false;
    }
  };

  const onVisible = (): void => {
    if (!active || deps.doc.visibilityState !== 'visible') return;
    if (sentinel && !sentinel.released) return;
    sentinel = undefined;
    request();
  };

  return {
    acquire() {
      if (active) return;
      active = true;
      deps.doc.addEventListener('visibilitychange', onVisible);
      request();
    },
    release() {
      if (!active) return;
      active = false;
      deps.doc.removeEventListener('visibilitychange', onVisible);
      const s = sentinel;
      sentinel = undefined;
      if (s) free(s);
    },
  };
}
