/** Minimal GitHub REST client on top of fetch. */
export declare class GitHub {
    #private;
    constructor(token: string, api?: string, fetchImpl?: typeof fetch);
    request(method: string, path: string, body?: unknown, accept?: string): Promise<Response>;
    json<T>(method: string, path: string, body?: unknown): Promise<T>;
    /** All pages of a list endpoint. */
    paginate<T>(path: string, max?: number): Promise<T[]>;
    /** A file's text at a commit, or `undefined` when it doesn't exist there. */
    fileAt(repo: string, path: string, ref: string): Promise<string | undefined>;
}
export declare class GitHubError extends Error {
    readonly status: number;
    constructor(status: number, message: string);
}
