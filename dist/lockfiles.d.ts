/** Package name → versions installed (sorted, unique). */
export type Installed = Map<string, string[]>;
export type LockfileKind = "npm" | "pnpm" | "yarn" | "bun";
/** Lockfile names this action understands, by kind. */
export declare const LOCKFILES: Record<string, LockfileKind>;
export declare function lockfileKind(path: string): LockfileKind | undefined;
/** Parse a lockfile's text into the packages it installs. Empty text gives an empty map. */
export declare function parseLockfile(kind: LockfileKind, text: string): Installed;
/** Compare semantic versions; non-semver strings sort after, alphabetically. */
export declare function compareVersions(a: string, b: string): number;
export declare function parseVersion(v: string): {
    nums: [number, number, number];
    pre: string;
} | undefined;
