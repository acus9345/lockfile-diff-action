import { formatBytes } from "./sizes.js";
/** Hidden marker that identifies this action's comment for one lockfile. */
export function marker(lockfile) {
    return `<!-- lockfile-diff-action:${lockfile} -->`;
}
const LABEL = {
    added: "added",
    removed: "removed",
    major: "🔴 major",
    minor: "🟡 minor",
    patch: "🟢 patch",
    prerelease: "prerelease",
    downgrade: "⚠️ downgrade",
    changed: "changed",
};
export function summarize(changes) {
    return {
        added: changes.filter((c) => c.kind === "added").length,
        removed: changes.filter((c) => c.kind === "removed").length,
        updated: changes.filter((c) => c.kind !== "added" && c.kind !== "removed").length,
        major: changes.filter((c) => c.kind === "major").length,
        direct: changes.filter((c) => c.direct).length,
        sizeDelta: changes.reduce((sum, c) => sum + (c.sizeDelta ?? 0), 0),
        sizesKnown: changes.some((c) => c.sizeDelta !== undefined),
    };
}
const versions = (list) => list.join(", ");
function row(c, sizes) {
    const name = c.direct ? `**${c.name}**` : c.name;
    const change = c.kind === "added"
        ? `added ${versions(c.to)}`
        : c.kind === "removed"
            ? `removed ${versions(c.from)}`
            : `${versions(c.from)} → ${versions(c.to)}`;
    const link = `[${name}](https://www.npmjs.com/package/${c.name})`;
    const size = sizes ? ` | ${c.sizeDelta === undefined ? "" : c.sizeDelta === 0 ? "±0" : formatBytes(c.sizeDelta)}` : "";
    return `| ${link} | ${change} | ${c.kind === "added" || c.kind === "removed" ? "" : LABEL[c.kind]}${size} |`;
}
function table(rows, sizes) {
    const header = sizes ? "| Package | Change | Type | Size |\n| --- | --- | --- | ---: |" : "| Package | Change | Type |\n| --- | --- | --- |";
    return `${header}\n${rows.map((c) => row(c, sizes)).join("\n")}`;
}
/** Markdown for one lockfile's changes. */
export function renderLockfile(lockfile, changes, options = {}) {
    const max = options.maxRows ?? 50;
    const s = summarize(changes);
    const lines = [marker(lockfile), `### 📦 Dependency changes in \`${lockfile}\``, ""];
    if (changes.length === 0) {
        lines.push("No packages were added, removed or changed version. The lockfile changed only in metadata (integrity hashes, resolved URLs or formatting).");
        return lines.join("\n");
    }
    const parts = [
        s.added ? `${s.added} added` : "",
        s.removed ? `${s.removed} removed` : "",
        s.updated ? `${s.updated} updated` : "",
    ].filter(Boolean);
    let headline = `**${parts.join(" · ")}**`;
    if (s.direct > 0)
        headline += ` (${s.direct} direct)`;
    if (s.major > 0)
        headline += ` · ${s.major} major ${s.major === 1 ? "bump" : "bumps"}`;
    if (s.sizesKnown)
        headline += ` · install size **${formatBytes(s.sizeDelta)}**`;
    lines.push(headline, "");
    const direct = changes.filter((c) => c.direct);
    const indirect = changes.filter((c) => !c.direct);
    const sizes = s.sizesKnown;
    if (direct.length > 0) {
        lines.push(table(direct.slice(0, max), sizes));
        if (direct.length > max)
            lines.push("", `…and ${direct.length - max} more direct changes.`);
        lines.push("");
    }
    if (indirect.length > 0) {
        const shown = indirect.slice(0, max);
        const body = `${table(shown, sizes)}${indirect.length > max ? `\n\n…and ${indirect.length - max} more.` : ""}`;
        if (direct.length > 0) {
            lines.push(`<details><summary>${indirect.length} indirect ${indirect.length === 1 ? "change" : "changes"}</summary>`, "", body, "", "</details>");
        }
        else
            lines.push(body);
    }
    return lines.join("\n").trimEnd();
}
/** Footer for the comment. */
export const FOOTER = "<sub>Posted by [lockfile-diff-action](https://github.com/acus9345/lockfile-diff-action). Sizes are unpacked sizes from the npm registry.</sub>";
