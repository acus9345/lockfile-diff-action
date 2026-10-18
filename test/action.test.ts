import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { classify, diffInstalled, directDependencies } from "../dist/diff.js";
import { compareVersions, parseLockfile, type LockfileKind } from "../dist/lockfiles.js";
import { COMMENT_MARKER, run } from "../dist/main.js";
import { renderLockfile } from "../dist/render.js";
import { addSizes, formatBytes } from "../dist/sizes.js";

const fixtures = join(import.meta.dirname, "fixtures");
const fixture = (name: string) => readFileSync(join(fixtures, name), "utf8");
const tmp = mkdtempSync(join(tmpdir(), "lockfile-diff-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

const FORMATS: [LockfileKind, string][] = [
  ["npm", "package-lock.json"],
  ["pnpm", "pnpm-lock.yaml"],
  ["yarn", "yarn-classic.lock"],
  ["yarn", "yarn-berry.lock"],
  ["bun", "bun.lock"],
];

describe("parseLockfile", () => {
  for (const [kind, file] of FORMATS) {
    it(`reads ${file}`, () => {
      const base = parseLockfile(kind, fixture(`base.${file}`));
      const head = parseLockfile(kind, fixture(`head.${file}`));
      assert.deepEqual(Object.fromEntries(base), { "@types/ms": ["0.7.34"], ms: ["2.1.2"] });
      assert.deepEqual(Object.fromEntries(head), { debug: ["4.3.7"], ms: ["2.1.3"] });
    });
  }

  it("reads npm v1 lockfiles and multiple versions", () => {
    const v1 = JSON.stringify({
      lockfileVersion: 1,
      dependencies: { a: { version: "1.0.0", dependencies: { b: { version: "2.0.0" } } }, b: { version: "1.0.0" }, local: { version: "file:../local" } },
    });
    assert.deepEqual(Object.fromEntries(parseLockfile("npm", v1)), { a: ["1.0.0"], b: ["1.0.0", "2.0.0"] });
    assert.deepEqual(parseLockfile("pnpm", ""), new Map());
  });

  it("reads pnpm 6 keys with peer suffixes", () => {
    const text = "lockfileVersion: '6.0'\n\npackages:\n\n  /react-dom@18.2.0(react@18.2.0):\n    resolution: {}\n\n  /@scope/pkg@1.0.0_react@18.2.0:\n    resolution: {}\n";
    assert.deepEqual(Object.fromEntries(parseLockfile("pnpm", text)), { "react-dom": ["18.2.0"], "@scope/pkg": ["1.0.0"] });
  });

  it("orders versions semantically", () => {
    assert.deepEqual(["1.10.0", "1.2.0", "1.2.0-beta.1", "1.2.0-beta.10", "1.2.0-beta.2"].sort(compareVersions), ["1.2.0-beta.1", "1.2.0-beta.2", "1.2.0-beta.10", "1.2.0", "1.10.0"]);
  });
});

describe("diff", () => {
  it("classifies updates", () => {
    assert.equal(classify("1.2.3", "2.0.0"), "major");
    assert.equal(classify("1.2.3", "1.3.0"), "minor");
    assert.equal(classify("1.2.3", "1.2.4"), "patch");
    assert.equal(classify("0.2.3", "0.3.0"), "major");
    assert.equal(classify("0.0.3", "0.0.4"), "major");
    assert.equal(classify("2.0.0", "1.9.0"), "downgrade");
    assert.equal(classify("1.0.0-rc.1", "1.0.0-rc.2"), "prerelease");
  });

  it("lists changes with direct dependencies first", () => {
    const changes = diffInstalled(
      parseLockfile("npm", fixture("base.package-lock.json")),
      parseLockfile("npm", fixture("head.package-lock.json")),
      new Set([...directDependencies(fixture("base.package.json")), ...directDependencies(fixture("head.package.json"))]),
    );
    assert.deepEqual(
      changes.map((c) => `${c.name}:${c.kind}:${c.direct}`),
      ["debug:added:true", "@types/ms:removed:true", "ms:patch:true"],
    );
  });
});

describe("render", () => {
  it("renders a table with sizes and collapses indirect changes", async () => {
    const changes = diffInstalled(
      new Map([["react", ["18.3.1"]], ["loose-envify", ["1.4.0"]], ["left-pad", ["1.3.0"]]]),
      new Map([["react", ["19.0.0"]], ["scheduler", ["0.25.0"]], ["left-pad", ["1.3.0"]]]),
      new Set(["react"]),
    );
    const sizes: Record<string, number> = { "react@18.3.1": 300_000, "react@19.0.0": 420_000, "scheduler@0.25.0": 80_000, "loose-envify@1.4.0": 5_000 };
    await addSizes(changes, {
      fetchImpl: (async (url: string) => {
        const [, name, version] = /registry\.npmjs\.org\/(.+)\/([^/]+)$/.exec(url)!;
        return new Response(JSON.stringify({ dist: { unpackedSize: sizes[`${decodeURIComponent(name!)}@${version}`] } }));
      }) as typeof fetch,
    });
    const md = renderLockfile("package-lock.json", changes);
    assert.match(md, /^<!-- lockfile-diff-action:package-lock\.json -->\n### 📦 Dependency changes in `package-lock\.json`\n\n\*\*1 added · 1 removed · 1 updated\*\* \(1 direct\) · 1 major bump · install size \*\*\+195 kB\*\*/);
    assert.match(md, /\| \[\*\*react\*\*\]\(https:\/\/www\.npmjs\.com\/package\/react\) \| 18\.3\.1 → 19\.0\.0 \| 🔴 major \| \+120 kB \|/);
    assert.match(md, /<details><summary>2 indirect changes<\/summary>\n\n\| Package \| Change \| Type \| Size \|[\s\S]*\| \[scheduler\]\(.*\) \| added 0\.25\.0 \|  \| \+80\.0 kB \|[\s\S]*<\/details>$/);
    assert.match(renderLockfile("yarn.lock", []), /changed only in metadata/);
    assert.equal(formatBytes(1_234_567), "+1.2 MB");
    assert.equal(formatBytes(-999), "-999 B");
  });
});

describe("run", () => {
  function github(files: Record<string, Record<string, string>>, comments: { id: number; body: string }[] = []) {
    const calls: { method: string; url: string; body?: unknown }[] = [];
    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? "GET";
      calls.push({ method, url: u, ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
      if (u.includes("registry.npmjs.org")) return new Response(JSON.stringify({ dist: { unpackedSize: 1000 } }));
      if (u.includes("/compare/")) return Response.json({ merge_base_commit: { sha: "mergebase" } });
      if (u.includes("/pulls/7/files")) return Response.json([{ filename: "app/package-lock.json", status: "modified" }, { filename: "README.md", status: "modified" }]);
      const content = /\/contents\/(.+)\?ref=(\w+)/.exec(u);
      if (content) {
        const text = files[content[2]!]?.[decodeURIComponent(content[1]!)];
        return text === undefined ? new Response("", { status: 404 }) : new Response(text);
      }
      if (u.includes("/issues/7/comments") && method === "GET") return Response.json(comments);
      if (method === "POST" || method === "PATCH") return Response.json({ id: 1 });
      return new Response("unexpected", { status: 500 });
    }) as typeof fetch;
    return { calls, fetchImpl };
  }

  function env(extra: Record<string, string> = {}) {
    const event = join(tmp, `event-${Math.random()}.json`);
    writeFileSync(event, JSON.stringify({ pull_request: { number: 7, base: { sha: "basesha" }, head: { sha: "headsha" } } }));
    const output = join(tmp, `out-${Math.random()}.txt`);
    const summary = join(tmp, `summary-${Math.random()}.md`);
    writeFileSync(output, "");
    writeFileSync(summary, "");
    return {
      env: {
        GITHUB_EVENT_NAME: "pull_request",
        GITHUB_EVENT_PATH: event,
        GITHUB_REPOSITORY: "me/app",
        GITHUB_OUTPUT: output,
        GITHUB_STEP_SUMMARY: summary,
        INPUT_TOKEN: "t",
        ...extra,
      },
      output,
      summary,
    };
  }

  const files = {
    mergebase: { "app/package-lock.json": fixture("base.package-lock.json"), "app/package.json": fixture("base.package.json") },
    headsha: { "app/package-lock.json": fixture("head.package-lock.json"), "app/package.json": fixture("head.package.json") },
  };

  it("diffs against the merge base, comments, and writes outputs", async () => {
    const gh = github(files);
    const e = env();
    const logs: string[] = [];
    assert.equal(await run(e.env, { fetch: gh.fetchImpl, log: (l) => logs.push(l) }), 0);
    const post = gh.calls.find((c) => c.method === "POST")!;
    assert.match(post.url, /\/repos\/me\/app\/issues\/7\/comments$/);
    const body = (post.body as { body: string }).body;
    assert.ok(body.startsWith(COMMENT_MARKER));
    assert.match(body, /Dependency changes in `app\/package-lock\.json`/);
    assert.match(body, /\*\*1 added · 1 removed · 1 updated\*\* \(3 direct\)/);
    assert.ok(gh.calls.some((c) => c.url.includes("ref=mergebase")));
    const out = readFileSync(e.output, "utf8");
    assert.match(out, /^changed=true\nadded=1\nremoved=1\nupdated=1\nmajor=0\n/);
    assert.match(readFileSync(e.summary, "utf8"), /Dependency changes/);
  });

  it("updates its existing comment instead of adding another", async () => {
    const gh = github(files, [{ id: 99, body: `${COMMENT_MARKER}\nold` }]);
    assert.equal(await run(env().env, { fetch: gh.fetchImpl, log: () => {} }), 0);
    assert.ok(gh.calls.some((c) => c.method === "PATCH" && c.url.endsWith("/issues/comments/99")));
    assert.ok(!gh.calls.some((c) => c.method === "POST"));
  });

  it("fails on direct changes listed in fail-on, and skips non-PR events", async () => {
    const logs: string[] = [];
    assert.equal(await run(env({ "INPUT_FAIL-ON": "added", INPUT_COMMENT: "false", INPUT_SIZES: "false" }).env, { fetch: github(files).fetchImpl, log: (l) => logs.push(l) }), 1);
    assert.match(logs.at(-1)!, /::error::1 direct dependency matched fail-on \(added\): debug \(added\)/);
    assert.equal(await run(env({ GITHUB_EVENT_NAME: "push" }).env, { fetch: github(files).fetchImpl, log: () => {} }), 0);
    assert.equal(await run(env({ "INPUT_FAIL-ON": "huge" }).env, { fetch: github(files).fetchImpl, log: () => {} }), 1);
  });
});
