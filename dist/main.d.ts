/** Marks the single comment this action keeps up to date on a pull request. */
export declare const COMMENT_MARKER = "<!-- lockfile-diff-action -->";
export interface RunIO {
    fetch: typeof fetch;
    log: (line: string) => void;
}
/** Read an action input the way the runner passes it: `INPUT_<NAME>` with spaces as underscores. */
export declare function input(env: NodeJS.ProcessEnv, name: string, fallback?: string): string;
/** Run the action. Returns the process exit code. */
export declare function run(env: NodeJS.ProcessEnv, io?: RunIO): Promise<number>;
