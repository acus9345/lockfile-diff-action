import type { Change } from "./diff.js";
/** Hidden marker that identifies this action's comment for one lockfile. */
export declare function marker(lockfile: string): string;
export interface Summary {
    added: number;
    removed: number;
    updated: number;
    major: number;
    direct: number;
    /** Sum of known size changes in bytes. */
    sizeDelta: number;
    /** Whether any size could be looked up. */
    sizesKnown: boolean;
}
export declare function summarize(changes: readonly Change[]): Summary;
/** Markdown for one lockfile's changes. */
export declare function renderLockfile(lockfile: string, changes: readonly Change[], options?: {
    maxRows?: number;
}): string;
/** Footer for the comment. */
export declare const FOOTER = "<sub>Posted by [lockfile-diff-action](https://github.com/acus9345/lockfile-diff-action). Sizes are unpacked sizes from the npm registry.</sub>";
