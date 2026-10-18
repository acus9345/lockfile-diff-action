import type { Change } from "./diff.js";

type Fetch = typeof fetch;

/** Unpacked size of one published version, from the npm registry. `undefined` when unknown. */
export async function unpackedSize(name: string, version: string, fetchImpl: Fetch = fetch, registry = "https://registry.npmjs.org"): Promise<number | undefined> {
  const url = `${registry.replace(/\/+$/, "")}/${name.startsWith("@") ? `@${encodeURIComponent(name.slice(1))}` : encodeURIComponent(name)}/${encodeURIComponent(version)}`;
  try {
    const res = await fetchImpl(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return undefined;
    const body = (await res.json()) as { dist?: { unpackedSize?: unknown } };
    return typeof body.dist?.unpackedSize === "number" ? body.dist.unpackedSize : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Fill in `sizeDelta` for changes, highest-version to highest-version.
 * Looks up at most `limit` versions, direct dependencies first, `concurrency` at a time.
 */
export async function addSizes(changes: Change[], options: { limit?: number; concurrency?: number; fetchImpl?: Fetch; registry?: string } = {}): Promise<void> {
  const limit = options.limit ?? 150;
  const concurrency = options.concurrency ?? 8;
  const cache = new Map<string, Promise<number | undefined>>();
  const size = (name: string, version: string | undefined) => {
    if (version === undefined) return Promise.resolve(0);
    const key = `${name}@${version}`;
    let p = cache.get(key);
    if (p === undefined) {
      if (cache.size >= limit) return Promise.resolve(undefined);
      p = unpackedSize(name, version, options.fetchImpl, options.registry);
      cache.set(key, p);
    }
    return p;
  };
  const queue = [...changes].filter((c) => c.kind !== "changed");
  const work = async () => {
    for (let c = queue.shift(); c !== undefined; c = queue.shift()) {
      const [before, after] = await Promise.all([size(c.name, c.from.at(-1)), size(c.name, c.to.at(-1))]);
      if (before !== undefined && after !== undefined) c.sizeDelta = after - before;
    }
  };
  await Promise.all(Array.from({ length: concurrency }, work));
}

/** `+1.2 MB`, `-340 kB`, `+12 B` (decimal units, like npm). */
export function formatBytes(bytes: number, signed = true): string {
  const sign = signed ? (bytes > 0 ? "+" : bytes < 0 ? "-" : "±") : "";
  const n = Math.abs(bytes);
  const units = ["B", "kB", "MB", "GB"];
  let i = 0;
  let value = n;
  while (value >= 1000 && i < units.length - 1) {
    value /= 1000;
    i++;
  }
  const text = i === 0 ? String(value) : value >= 100 ? value.toFixed(0) : value.toFixed(1);
  return `${sign}${text} ${units[i]}`;
}
