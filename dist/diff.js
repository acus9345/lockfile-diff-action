import { compareVersions, parseVersion } from "./lockfiles.js";
/** Compare two lockfile snapshots. `directNames` are the names in package.json. */
export function diffInstalled(base, head, directNames = new Set()) {
    const changes = [];
    const names = new Set([...base.keys(), ...head.keys()]);
    for (const name of names) {
        const from = base.get(name) ?? [];
        const to = head.get(name) ?? [];
        if (from.join() === to.join())
            continue;
        let kind;
        if (from.length === 0)
            kind = "added";
        else if (to.length === 0)
            kind = "removed";
        else
            kind = classify(from.at(-1), to.at(-1));
        changes.push({ name, kind, from, to, direct: directNames.has(name) });
    }
    const order = ["major", "downgrade", "added", "removed", "minor", "prerelease", "patch", "changed"];
    return changes.sort((a, b) => Number(b.direct) - Number(a.direct) || order.indexOf(a.kind) - order.indexOf(b.kind) || a.name.localeCompare(b.name));
}
/** What kind of update `from` → `to` is, by their highest versions. */
export function classify(from, to) {
    const a = parseVersion(from);
    const b = parseVersion(to);
    if (!a || !b)
        return "changed";
    const cmp = compareVersions(from, to);
    if (cmp > 0)
        return "downgrade";
    if (cmp === 0)
        return "changed"; // same highest version, different set of others
    if (b.nums[0] !== a.nums[0])
        return "major";
    // Before 1.0, a minor bump can break things, so it counts as major.
    if (b.nums[1] !== a.nums[1])
        return a.nums[0] === 0 ? "major" : "minor";
    if (b.nums[2] !== a.nums[2])
        return a.nums[0] === 0 && a.nums[1] === 0 ? "major" : "patch";
    return "prerelease";
}
/** Names declared in a package.json. */
export function directDependencies(packageJson) {
    if (!packageJson)
        return new Set();
    try {
        const pkg = JSON.parse(packageJson);
        return new Set(["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"].flatMap((k) => Object.keys(pkg[k] ?? {})));
    }
    catch {
        return new Set();
    }
}
