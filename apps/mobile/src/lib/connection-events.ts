type RestoreListener = () => void;
const listeners = new Set<RestoreListener>();

export function emitConnectionRestored() {
  for (const listener of listeners) listener();
}

export function subscribeConnectionRestored(listener: RestoreListener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
