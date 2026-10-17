import { joinUrl, parseFlags } from './config';
import { createHost } from './engine/host';
import { createEngine } from './engine/party';
import { mulberry32, randomSeed } from './engine/prng';
import type { After, Every } from './engine/types';
import type { Sfx } from './games/types';
import { gamesFor } from './games/index';
import { createClientSession } from './net/client';
import { normalizeCode } from './net/code';
import { createTransport } from './net/transport';
import { neutralScreen } from './ui/components';
import { clear } from './ui/dom';
import { createFx } from './ui/fx';
import { browserVibrate, createBuzz } from './ui/haptics';
import { createSfx } from './ui/sfx';
import { createWakeLock } from './ui/wakelock';
import { MAX_NAME, mountName } from './ui/screens/name';
import { mountParty } from './ui/screens/party';
import { mountStart } from './ui/screens/start';
import type { Env, Unmount } from './ui/screens/types';

const PID_KEY = 'wgarcade.pid';
const NAME_KEY = 'wgarcade.name';
const JOINED_KEY = 'wgarcade.joined';

const every: Every = (ms, fn) => {
  const id = setInterval(fn, ms);
  return () => clearInterval(id);
};
const after: After = (ms, fn) => {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
};

function guard<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

const storage = (s: () => Storage) => ({
  get: (k: string): string | null => guard(() => s().getItem(k), null),
  set: (k: string, v: string): void => guard(() => s().setItem(k, v), undefined),
  del: (k: string): void => guard(() => s().removeItem(k), undefined),
});
const local = storage(() => localStorage);
const session = storage(() => sessionStorage);

function newPid(): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  return Array.from(c.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
}

function getPid(): string {
  let pid = session.get(PID_KEY);
  if (!pid) {
    pid = newPid();
    session.set(PID_KEY, pid);
  }
  return pid;
}

const validName = (n: string | null): n is string => n !== null && n.trim().length >= 1 && n.trim().length <= MAX_NAME;

export function startApp(root: HTMLElement): void {
  const flags = parseFlags(location.search);
  const pid = getPid();
  let hostIntent = false;
  let running: Unmount | undefined;
  let epoch = 0;
  let transport: ReturnType<typeof createTransport> | undefined;
  const getTransport = () => (transport ??= createTransport(flags.net));

  const sound = createSfx();
  const sfx: Sfx = { ...sound, buzz: createBuzz({ vibrate: browserVibrate(), muted: () => sound.muted() }) };
  const fx = createFx();
  const wake = createWakeLock();
  for (const type of ['pointerdown', 'pointerup', 'keydown'])
    document.addEventListener(type, () => sound.unlock(), { capture: true, passive: true });
  document.addEventListener(
    'click',
    (e) => {
      if (!(e.target instanceof Element) || !e.target.closest('button:not(:disabled):not([data-silent])')) return;
      sfx.play('tap');
      sfx.buzz(10);
    },
    true,
  );

  const mount = (make: (slot: HTMLElement) => Unmount): void => {
    running?.destroy();
    running = undefined;
    clear(root);
    running = make(root);
  };

  const go = (hash: string): void => {
    if (location.hash === hash) route();
    else location.hash = hash;
  };

  const toStart = (banner?: string): void => {
    history.replaceState(null, '', `${location.pathname}${location.search}#/`);
    showStart(banner);
  };

  const neutral = (text: string): void =>
    mount((slot) => {
      const el = neutralScreen(text);
      slot.append(el);
      return { destroy: () => el.remove() };
    });

  function showStart(banner?: string): void {
    mount((slot) =>
      mountStart(slot, {
        banner,
        sfx,
        onHost: () => {
          hostIntent = true;
          go('#/host');
        },
        onJoin: (code) => go(`#/j/${code}`),
      }),
    );
  }

  function showName(onSubmit: (name: string) => void, error?: string): void {
    mount((slot) =>
      mountName(slot, {
        initial: local.get(NAME_KEY) ?? '',
        error,
        onSubmit: (name) => {
          local.set(NAME_KEY, name);
          onSubmit(name);
        },
      }),
    );
  }

  const envFor = (host?: { control: Env['control'] }, s?: ReturnType<typeof createClientSession>): Env => ({
    ctx: {
      me: pid,
      toLocal: (t) => (s ? s.toLocal(t) : t),
      sfx,
      fx,
      reducedMotion: fx.reducedMotion(),
    },
    send: (round, payload) => s?.input(round, payload),
    control: host?.control,
    joinUrl: (code) => joinUrl(location.origin, import.meta.env.BASE_URL, location.search, code),
  });

  async function launchHost(name: string): Promise<void> {
    const my = epoch;
    neutral('Party wird erstellt …');
    try {
      const host = await createHost({
        transport: await getTransport(),
        engine: createEngine(gamesFor(flags.only)),
        now: () => performance.now(),
        every,
        seed: randomSeed(),
        rand: mulberry32(randomSeed()),
        dev: flags.dev,
        speed: flags.speed,
        hostPid: pid,
      });
      if (my !== epoch) {
        host.stop();
        return;
      }
      const sess = createClientSession({
        connect: () => Promise.resolve(host.connectLocal()),
        pid,
        name,
        now: () => performance.now(),
        every,
        after,
      });
      const env = envFor({ control: (a) => host.control(a) }, sess);
      mount((slot) => {
        const party = mountParty(slot, {
          session: sess,
          env,
          onHome: () => go('#/'),
          onBadName: () => go('#/'),
        });
        wake.acquire();
        return {
          destroy() {
            wake.release();
            party.destroy();
            sess.close();
            host.stop();
          },
        };
      });
    } catch (e) {
      console.error(e);
      if (my === epoch) toStart('Party konnte nicht gestartet werden.');
    }
  }

  function launchClient(code: string, name: string): void {
    const sess = createClientSession({
      connect: async () => (await getTransport()).join(code),
      pid,
      name,
      now: () => performance.now(),
      every,
      after,
    });
    sess.onState((st) => {
      if (st.st === 'joined') session.set(JOINED_KEY, code);
    });
    const env = envFor(undefined, sess);
    mount((slot) => {
      const party = mountParty(slot, {
        session: sess,
        env,
        onRejoin: () => go(`#/j/${code}`),
        onHome: () => {
          session.del(JOINED_KEY);
          go('#/');
        },
        onBadName: () => showName((n) => launchClient(code, n), 'Dieser Name ist nicht erlaubt.'),
      });
      wake.acquire();
      return {
        destroy() {
          wake.release();
          party.destroy();
          sess.close();
        },
      };
    });
  }

  function route(): void {
    epoch++;
    const hash = location.hash;
    if (hash === '#/host') {
      if (!hostIntent) return toStart();
      hostIntent = false;
      return showName((name) => void launchHost(name));
    }
    const m = /^#\/j\/(.*)$/.exec(hash);
    if (m) {
      const code = normalizeCode(guard(() => decodeURIComponent(m[1] ?? ''), ''));
      if (!code) return toStart('Ungültiger Raumcode.');
      const saved = local.get(NAME_KEY);
      if (session.get(JOINED_KEY) === code && validName(saved)) return launchClient(code, saved.trim());
      return showName((name) => launchClient(code, name));
    }
    showStart();
  }

  addEventListener('hashchange', route);
  route();
}
