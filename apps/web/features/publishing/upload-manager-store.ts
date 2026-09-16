/**
 * A minimal external store for `useSyncExternalStore`: immutable snapshots,
 * listeners notified once per microtask so progress bursts do not re-render
 * per byte event.
 */

export interface ExternalStore<T> {
  get(): T;
  set(next: T): void;
  update(change: (current: T) => T): void;
  subscribe(listener: () => void): () => void;
}

export const createExternalStore = <T>(
  initial: T,
  schedule: (flush: () => void) => void = queueMicrotask,
): ExternalStore<T> => {
  let value = initial;
  let pending = false;
  const listeners = new Set<() => void>();
  const notify = () => {
    if (pending) return;
    pending = true;
    schedule(() => {
      pending = false;
      for (const listener of [...listeners]) listener();
    });
  };
  return {
    get: () => value,
    set: (next) => {
      if (Object.is(next, value)) return;
      value = next;
      notify();
    },
    update(change) {
      this.set(change(value));
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};
