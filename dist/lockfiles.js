/** Lockfile names this action understands, by kind. */
export const LOCKFILES = {
    "package-lock.json": "npm",
    "npm-shrinkwrap.json": "npm",
    "pnpm-lock.yaml": "pnpm",
    "yarn.lock": "yarn",
    "bun.lock": "bun",
};
export function lockfileKind(path) {
    return LOCKFILES[path.split("/").at(-1) ?? ""];
}
/** Parse a lockfile's text into the packages it installs. Empty text gives an empty map. */
export function parseLockfile(kind, text) {
    if (text.trim() === "")
        return new Map();
    switch (kind) {
        case "npm":
            return parseNpm(text);
        case "pnpm":
            return parsePnpm(text);
        case "yarn":
            return parseYarn(text);
        case "bun":
            return parseBun(text);
    }
}
class Collector {
    map = new Map();
    add(name, version) {
        if (!name || !version)
            return;
        const list = this.map.get(name) ?? [];
        if (!list.includes(version))
            list.push(version);
        this.map.set(name, list);
    }
    done() {
        for (const list of this.map.values())
            list.sort(compareVersions);
        return this.map;
    }
}
function parseNpm(text) {
    const lock = JSON.parse(text);
    const c = new Collector();
    if (lock.packages) {
        for (const [path, info] of Object.entries(lock.packages)) {
            if (path === "" || info.link || !info.version)
                continue;
            const at = path.lastIndexOf("node_modules/");
            if (at === -1)
                continue; // workspace package folders
            c.add(info.name ?? path.slice(at + "node_modules/".length), info.version);
        }
    }
    else if (lock.dependencies) {
        const walk = (deps) => {
            for (const [name, info] of Object.entries(deps)) {
                if (info.version && !info.version.startsWith("file:"))
                    c.add(name, info.version);
                if (info.dependencies)
                    walk(info.dependencies);
            }
        };
        walk(lock.dependencies);
    }
    return c.done();
}
function parsePnpm(text) {
    const c = new Collector();
    let inPackages = false;
    for (const raw of text.split(/\r?\n/)) {
        if (/^\S/.test(raw)) {
            // pnpm 9 lists versions under both `packages:` and `snapshots:`; `packages:` is enough.
            inPackages = /^packages:\s*$/.test(raw);
            continue;
        }
        if (!inPackages)
            continue;
        const m = /^ {2}(['"]?)(.+?)\1:\s*$/.exec(raw);
        if (!m)
            continue;
        const parsed = splitPnpmKey(m[2].replace(/\(.*$/, "")); // drop `(peer@x)` suffixes
        // pnpm 6 appended peers with `_`: 1.0.0_react@18.2.0
        if (parsed)
            c.add(parsed.name, parsed.version.replace(/_.*$/, ""));
    }
    return c.done();
}
/** `/lodash@4.17.21`, `lodash@4.17.21`, `/@scope/pkg@1.0.0`, `/lodash/4.17.21` (pnpm 5). */
function splitPnpmKey(key) {
    const k = key.replace(/^\//, "");
    // A name has an @ only at the start (scopes), so the first later @ starts the version.
    const at = k.indexOf("@", 1);
    if (at > 0)
        return { name: k.slice(0, at), version: k.slice(at + 1) };
    const slash = k.lastIndexOf("/");
    if (slash > 0)
        return { name: k.slice(0, slash), version: k.slice(slash + 1) };
    return undefined;
}
function parseYarn(text) {
    const c = new Collector();
    let names = [];
    for (const raw of text.split(/\r?\n/)) {
        if (raw.startsWith("#") || raw.trim() === "")
            continue;
        if (/^\S/.test(raw)) {
            names = [];
            if (raw.startsWith("__metadata"))
                continue;
            // `"a@^1", a@^1.2:` (classic) or `"a@npm:^1, a@npm:^1.2":` (berry)
            for (const descriptor of raw.replace(/:\s*$/, "").split(/,\s*/)) {
                const d = descriptor.trim().replace(/^"|"$/g, "");
                if (/@(?:workspace|link|portal|patch|file):/.test(d))
                    continue;
                const at = d.indexOf("@", 1);
                if (at > 0)
                    names.push(d.slice(0, at));
            }
            continue;
        }
        const v = /^ {2}version:?\s+"?([^"\s]+)"?\s*$/.exec(raw);
        if (v && names.length > 0) {
            for (const n of new Set(names))
                c.add(n, v[1]);
            names = [];
        }
    }
    return c.done();
}
function parseBun(text) {
    // bun.lock is JSON with trailing commas.
    const json = JSON.parse(text.replace(/,(\s*[}\]])/g, "$1"));
    const c = new Collector();
    for (const value of Object.values(json.packages ?? {})) {
        const spec = Array.isArray(value) ? value[0] : undefined;
        if (typeof spec !== "string")
            continue;
        const at = spec.indexOf("@", 1);
        if (at <= 0)
            continue;
        const version = spec.slice(at + 1);
        if (/^(?:workspace|link|file|git|github):/.test(version) || version.includes("workspace:"))
            continue;
        c.add(spec.slice(0, at), version.replace(/^npm:/, ""));
    }
    return c.done();
}
/** Compare semantic versions; non-semver strings sort after, alphabetically. */
export function compareVersions(a, b) {
    const pa = parseVersion(a);
    const pb = parseVersion(b);
    if (!pa || !pb)
        return pa ? -1 : pb ? 1 : a.localeCompare(b);
    for (let i = 0; i < 3; i++)
        if (pa.nums[i] !== pb.nums[i])
            return pa.nums[i] - pb.nums[i];
    if (pa.pre === pb.pre)
        return 0;
    if (pa.pre === "")
        return 1;
    if (pb.pre === "")
        return -1;
    return pa.pre.localeCompare(pb.pre, undefined, { numeric: true });
}
export function parseVersion(v) {
    const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/.exec(v.trim());
    return m ? { nums: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ?? "" } : undefined;
}
