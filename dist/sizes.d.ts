import type { Change } from "./diff.js";
type Fetch = typeof fetch;
/** Unpacked size of one published version, from the npm registry. `undefined` when unknown. */
export declare function unpackedSize(name: string, version: string, fetchImpl?: Fetch, registry?: string): Promise<number | undefined>;
/**
 * Fill in `sizeDelta` for changes, highest-version to highest-version.
 * Looks up at most `limit` versions, direct dependencies first, `concurrency` at a time.
 */
export declare function addSizes(changes: Change[], options?: {
    limit?: number;
    concurrency?: number;
    fetchImpl?: Fetch;
    registry?: string;
}): Promise<void>;
/** `+1.2 MB`, `-340 kB`, `+12 B` (decimal units, like npm). */
export declare function formatBytes(bytes: number, signed?: boolean): string;
export {};
