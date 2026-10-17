export type Child = Node | string | false | null | undefined;
type Attrs = Record<string, string | number | boolean | null | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...kids: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    el.setAttribute(k === 'testid' ? 'data-testid' : k, v === true ? '' : String(v));
  }
  el.append(...kids.filter((c): c is Node | string => c !== null && c !== undefined && c !== false));
  return el;
}

export function clear(el: Element): void {
  el.replaceChildren();
}

export function qs<T extends Element>(root: ParentNode, sel: string): T {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`Element fehlt: ${sel}`);
  return el;
}

export interface Scope {
  on(target: EventTarget, type: string, fn: (e: Event) => void): void;
  add(off: () => void): void;
  dispose(): void;
}

export function createScope(): Scope {
  const offs: (() => void)[] = [];
  return {
    on(target, type, fn) {
      target.addEventListener(type, fn);
      offs.push(() => target.removeEventListener(type, fn));
    },
    add: (off) => void offs.push(off),
    dispose() {
      for (const off of offs.splice(0)) off();
    },
  };
}
