import { type Installed } from "./lockfiles.js";
export type ChangeKind = "added" | "removed" | "major" | "minor" | "patch" | "prerelease" | "downgrade" | "changed";
export interface Change {
    name: string;
    kind: ChangeKind;
    /** Versions before (empty when added). */
    from: string[];
    /** Versions after (empty when removed). */
    to: string[];
    /** Listed in package.json (dependencies, devDependencies, optional or peer). */
    direct: boolean;
    /** Change in unpacked install size in bytes, when known. */
    sizeDelta?: number;
}
/** Compare two lockfile snapshots. `directNames` are the names in package.json. */
export declare function diffInstalled(base: Installed, head: Installed, directNames?: ReadonlySet<string>): Change[];
/** What kind of update `from` → `to` is, by their highest versions. */
export declare function classify(from: string, to: string): ChangeKind;
/** Names declared in a package.json. */
export declare function directDependencies(packageJson: string | undefined): Set<string>;
