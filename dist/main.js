import { appendFileSync, readFileSync } from "node:fs";
import { posix } from "node:path";
import { diffInstalled, directDependencies } from "./diff.js";
import { GitHub, GitHubError } from "./github.js";
import { lockfileKind, parseLockfile } from "./lockfiles.js";
import { FOOTER, renderLockfile, summarize } from "./render.js";
import { addSizes } from "./sizes.js";
/** Marks the single comment this action keeps up to date on a pull request. */
export const COMMENT_MARKER = "<!-- lockfile-diff-action -->";
const FAIL_KINDS = ["major", "downgrade", "added", "removed"];
/** Read an action input the way the runner passes it: `INPUT_<NAME>` with spaces as underscores. */
export function input(env, name, fallback = "") {
    return (env[`INPUT_${name.replace(/ /g, "_").toUpperCase()}`] ?? fallback).trim();
}
const bool = (v, fallback) => (v === "" ? fallback : /^(true|yes|1|on)$/i.test(v));
/** Run the action. Returns the process exit code. */
export async function run(env, io = { fetch, log: (l) => console.log(l) }) {
    const token = input(env, "token") || env.GITHUB_TOKEN || "";
    const repo = env.GITHUB_REPOSITORY ?? "";
    const event = env.GITHUB_EVENT_NAME ?? "";
    const wantComment = bool(input(env, "comment"), true);
    const wantSizes = bool(input(env, "sizes"), true);
    const maxRows = Number(input(env, "max-rows", "50")) || 50;
    const failOn = input(env, "fail-on")
        .split(/[\s,]+/)
        .filter(Boolean);
    const unknownFail = failOn.filter((k) => !FAIL_KINDS.includes(k));
    if (unknownFail.length > 0) {
        io.log(`::error::Unknown fail-on value: ${unknownFail.join(", ")}. Use any of: ${FAIL_KINDS.join(", ")}.`);
        return 1;
    }
    if (!token) {
        io.log("::error::No GitHub token. Pass `token: ${{ github.token }}` (the default) or a personal access token.");
        return 1;
    }
    if (event !== "pull_request" && event !== "pull_request_target") {
        io.log(`::notice::lockfile-diff-action only runs on pull_request events (this is "${event}"). Nothing to do.`);
        return 0;
    }
    let payload;
    try {
        payload = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH ?? "", "utf8"));
    }
    catch {
        io.log("::error::Could not read the event payload (GITHUB_EVENT_PATH).");
        return 1;
    }
    const pr = payload.pull_request;
    if (!pr) {
        io.log("::error::The event payload has no pull_request.");
        return 1;
    }
    const gh = new GitHub(token, env.GITHUB_API_URL, io.fetch);
    // Diff against the merge base, like the PR's "Files changed" tab, so base-branch changes don't show up.
    let baseSha = pr.base.sha;
    try {
        const compare = await gh.json("GET", `/repos/${repo}/compare/${pr.base.sha}...${pr.head.sha}`);
        baseSha = compare.merge_base_commit?.sha ?? baseSha;
    }
    catch {
        // Fall back to the base branch tip.
    }
    const files = await gh.paginate(`/repos/${repo}/pulls/${pr.number}/files`);
    const lockfiles = files.filter((f) => lockfileKind(f.filename) !== undefined);
    const sections = [];
    const all = [];
    for (const f of lockfiles) {
        const kind = lockfileKind(f.filename);
        const basePath = f.previous_filename ?? f.filename;
        const [baseText, headText] = await Promise.all([
            f.status === "added" ? Promise.resolve("") : gh.fileAt(repo, basePath, baseSha).then((t) => t ?? ""),
            f.status === "removed" ? Promise.resolve("") : gh.fileAt(repo, f.filename, pr.head.sha).then((t) => t ?? ""),
        ]);
        const dir = posix.dirname(f.filename);
        const pkgPath = dir === "." ? "package.json" : `${dir}/package.json`;
        const [basePkg, headPkg] = await Promise.all([gh.fileAt(repo, pkgPath, baseSha), gh.fileAt(repo, pkgPath, pr.head.sha)]);
        const direct = new Set([...directDependencies(basePkg), ...directDependencies(headPkg)]);
        let changes;
        try {
            changes = diffInstalled(parseLockfile(kind, baseText), parseLockfile(kind, headText), direct);
        }
        catch (error) {
            io.log(`::warning::Could not parse ${f.filename}: ${error.message}`);
            continue;
        }
        if (wantSizes && changes.length > 0)
            await addSizes(changes, { fetchImpl: io.fetch });
        sections.push(renderLockfile(f.filename, changes, { maxRows }));
        all.push(...changes);
        io.log(`${f.filename}: ${changes.length} package ${changes.length === 1 ? "change" : "changes"}`);
    }
    const body = sections.length > 0 ? `${COMMENT_MARKER}\n${sections.join("\n\n")}\n\n${FOOTER}` : undefined;
    if (wantComment) {
        try {
            const comments = await gh.paginate(`/repos/${repo}/issues/${pr.number}/comments`);
            const existing = comments.find((c) => c.body?.includes(COMMENT_MARKER));
            if (body !== undefined) {
                if (existing)
                    await gh.json("PATCH", `/repos/${repo}/issues/comments/${existing.id}`, { body });
                else
                    await gh.json("POST", `/repos/${repo}/issues/${pr.number}/comments`, { body });
            }
            else if (existing) {
                await gh.json("PATCH", `/repos/${repo}/issues/comments/${existing.id}`, {
                    body: `${COMMENT_MARKER}\n### 📦 Dependency changes\n\nThis pull request no longer changes any lockfile.\n\n${FOOTER}`,
                });
            }
        }
        catch (error) {
            if (error instanceof GitHubError && (error.status === 403 || error.status === 404)) {
                io.log("::warning::Could not comment on the pull request (the token can't write to it, which is normal for pull requests from forks). The summary is in the job summary instead. Give the workflow `permissions: pull-requests: write`, or use pull_request_target with care.");
            }
            else
                throw error;
        }
    }
    const summary = summarize(all);
    if (env.GITHUB_STEP_SUMMARY)
        appendFileSync(env.GITHUB_STEP_SUMMARY, `${body ?? "No lockfile changes in this pull request."}\n`);
    if (env.GITHUB_OUTPUT) {
        const delimiter = `EOF_${Math.random().toString(36).slice(2)}`;
        appendFileSync(env.GITHUB_OUTPUT, [
            `changed=${all.length > 0}`,
            `added=${summary.added}`,
            `removed=${summary.removed}`,
            `updated=${summary.updated}`,
            `major=${summary.major}`,
            `size-delta=${summary.sizeDelta}`,
            `markdown<<${delimiter}`,
            body ?? "",
            delimiter,
            "",
        ].join("\n"));
    }
    if (lockfiles.length === 0)
        io.log("No lockfile changes in this pull request.");
    const failing = all.filter((c) => c.direct && failOn.includes(c.kind));
    if (failing.length > 0) {
        io.log(`::error::${failing.length} direct ${failing.length === 1 ? "dependency" : "dependencies"} matched fail-on (${failOn.join(", ")}): ${failing.map((c) => `${c.name} (${c.kind})`).join(", ")}`);
        return 1;
    }
    return 0;
}
