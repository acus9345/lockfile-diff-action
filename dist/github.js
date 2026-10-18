/** Minimal GitHub REST client on top of fetch. */
export class GitHub {
    #token;
    #api;
    #fetch;
    constructor(token, api = "https://api.github.com", fetchImpl = fetch) {
        this.#token = token;
        this.#api = api.replace(/\/+$/, "");
        this.#fetch = fetchImpl;
    }
    async request(method, path, body, accept = "application/vnd.github+json") {
        const res = await this.#fetch(`${this.#api}${path}`, {
            method,
            headers: {
                accept,
                authorization: `Bearer ${this.#token}`,
                "x-github-api-version": "2022-11-28",
                "user-agent": "lockfile-diff-action",
                ...(body === undefined ? {} : { "content-type": "application/json" }),
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        return res;
    }
    async json(method, path, body) {
        const res = await this.request(method, path, body);
        if (!res.ok)
            throw new GitHubError(res.status, `${method} ${path} failed: ${res.status} ${await res.text().catch(() => "")}`.slice(0, 500));
        return (await res.json());
    }
    /** All pages of a list endpoint. */
    async paginate(path, max = 3000) {
        const out = [];
        for (let page = 1; out.length < max; page++) {
            const sep = path.includes("?") ? "&" : "?";
            const batch = await this.json("GET", `${path}${sep}per_page=100&page=${page}`);
            out.push(...batch);
            if (batch.length < 100)
                break;
        }
        return out;
    }
    /** A file's text at a commit, or `undefined` when it doesn't exist there. */
    async fileAt(repo, path, ref) {
        const res = await this.request("GET", `/repos/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`, undefined, "application/vnd.github.raw+json");
        if (res.status === 404)
            return undefined;
        if (!res.ok)
            throw new GitHubError(res.status, `Could not read ${path} at ${ref.slice(0, 7)}: ${res.status}`);
        return res.text();
    }
}
export class GitHubError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.name = "GitHubError";
        this.status = status;
    }
}
