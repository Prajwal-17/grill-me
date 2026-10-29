import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import type { InitializeParams } from "./protocol/InitializeParams";
export const codexBinary = () => process.env.CODEX_BIN || "codex";
type Wire = {
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
};
export class CodexClient {
  private process: ChildProcessWithoutNullStreams;
  private sequence = 0;
  private failure: Error | undefined;
  private timeout: number;
  private pending = new Map<
    number,
    {
      resolve: (result: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  onWire: (direction: "sent" | "received", message: Wire) => void = () => {};
  onEvent: (event: Wire) => void = () => {};
  onExit: (error: Error) => void = () => {};
  onTool: ((tool: string, args: unknown) => Promise<unknown>) | null = null;
  constructor(
    binary = codexBinary(),
    options: { env?: NodeJS.ProcessEnv; cwd?: string; timeout?: number } = {},
  ) {
    this.timeout = options.timeout ?? 60000;
    this.process = spawn(binary, ["app-server"], {
      stdio: "pipe",
      env: options.env,
      cwd: options.cwd,
    });
    const lines = createInterface({ input: this.process.stdout });
    lines.on("line", (line) => {
      try {
        if (line.length > 4 * 1024 * 1024)
          throw new Error("Codex protocol frame exceeds the local limit.");
        const event = JSON.parse(line) as Wire;
        this.onWire("received", event);
        if (event.id !== undefined && !event.method) {
          const pending = this.pending.get(Number(event.id));
          if (pending) {
            clearTimeout(pending.timer);
            this.pending.delete(Number(event.id));
            if (event.error)
              pending.reject(
                Object.assign(
                  new Error(event.error.message ?? "Codex request failed"),
                  { code: event.error.code, data: event.error.data },
                ),
              );
            else pending.resolve(event.result);
          }
        } else if (event.id !== undefined && event.method) {
          if (event.method === "item/tool/call" && this.onTool) {
            void this.onTool(
              String(event.params?.tool),
              event.params?.arguments,
            )
              .then((value) =>
                this.send({
                  id: event.id,
                  result: {
                    success: true,
                    contentItems: [
                      { type: "inputText", text: JSON.stringify(value) },
                    ],
                  },
                }),
              )
              .catch((error) =>
                this.send({
                  id: event.id,
                  result: {
                    success: false,
                    contentItems: [
                      {
                        type: "inputText",
                        text:
                          error instanceof Error
                            ? error.message
                            : "File access failed",
                      },
                    ],
                  },
                }),
              )
              .catch((error) => {
                this.fail(error);
                this.process.kill();
              });
          } else
            this.send({
              id: event.id,
              result: event.method.includes("requestApproval")
                ? { decision: "decline" }
                : undefined,
              ...(event.method.includes("requestApproval")
                ? {}
                : {
                    error: {
                      code: -32601,
                      message:
                        "Grill Me does not support this provider request.",
                    },
                  }),
            });
        } else this.onEvent(event);
      } catch (error) {
        this.fail(
          error instanceof Error
            ? error
            : new Error("Codex returned an invalid protocol message."),
        );
        this.process.kill();
      }
    });
    this.process.stdin.on("error", (e) => this.fail(e));
    this.process.stderr.resume();
    this.process.on("error", (e) => this.fail(e));
    this.process.on("exit", () =>
      this.fail(
        new Error("Codex app-server exited before the operation finished."),
      ),
    );
  }
  private fail(error: Error) {
    this.failure ??= error;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    this.pending.clear();
    this.onExit(error);
  }
  private send(value: Wire) {
    if (this.process.stdin.destroyed || this.process.killed)
      throw new Error("Codex connection is closed.");
    this.onWire("sent", value);
    this.process.stdin.write(JSON.stringify(value) + "\n");
  }
  request<T>(method: string, params: unknown): Promise<T> {
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new DOMException(`Codex ${method} timed out.`, "TimeoutError"));
      }, this.timeout);
      this.pending.set(id, { resolve: (r) => resolve(r as T), reject, timer });
      try {
        this.send({ id, method, params: params as Wire["params"] });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }
  async initialize() {
    const params: InitializeParams = {
      clientInfo: { name: "grill_me", title: "Grill Me", version: "0.2.0" },
      capabilities: { experimentalApi: true, requestAttestation: false },
    };
    await this.request("initialize", params);
    this.send({ method: "initialized", params: {} });
  }
  close() {
    this.onExit = () => {};
    this.process.kill();
    const timer = setTimeout(() => this.process.kill("SIGKILL"), 2000);
    timer.unref();
    this.process.once("exit", () => clearTimeout(timer));
    this.fail(new Error("Codex connection closed."));
  }
}
