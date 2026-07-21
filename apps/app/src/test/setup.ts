// Setup global de los tests (vitest `setupFiles`).
//
// Polyfill de `localStorage`: happy-dom@20 no lo expone bajo algunas versiones de Node
// (ej. Node 26, con el que corre el hook pre-push vía pnpm) — deja `window`/`document`
// definidos pero `localStorage` en undefined. Instalamos un storage en memoria SOLO cuando
// falta, para que los tests que lo usan corran igual en cualquier versión de Node. Cuando el
// entorno ya provee localStorage (happy-dom bajo Node 22, o un browser real), no se toca nada.

class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
}

if (typeof globalThis.localStorage === "undefined") {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
  if (typeof window !== "undefined") {
    Object.defineProperty(window, "localStorage", { value: storage, configurable: true });
  }
}
