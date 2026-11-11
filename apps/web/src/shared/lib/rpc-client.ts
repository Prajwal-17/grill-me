import {
  PROTOCOL_VERSION,
  serverFrameSchema,
  type ApiCall,
  type ConnectionBootstrap,
  type RpcError,
} from "@repo/backend/shared/contracts";
export class RpcClientError extends Error {
  constructor(public readonly error: RpcError) {
    super(error.message);
    this.name = "RpcClientError";
  }
  get code() {
    return this.error.code;
  }
  get retryable() {
    return this.error.retryable;
  }
}
type Pending = {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  delta?: (text: string) => void;
  cleanup: () => void;
};
export class LocalClient {
  private socket?: WebSocket;
  private connecting?: Promise<WebSocket>;
  private pending = new Map<string, Pending>();
  private statusListeners = new Set<() => void>();
  get isConnected() {
    return this.socket?.readyState === WebSocket.OPEN;
  }
  onStatus(listener: () => void) {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }
  private statusChanged() {
    for (const listener of this.statusListeners) listener();
  }
  private listeners = new Set<(tables?: string[]) => void>();
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private heartbeat?: ReturnType<typeof setInterval>;
  private stopped = false;
  private attempt = 0;
  constructor(private bootstrap: () => Promise<ConnectionBootstrap>) {}
  private async connect(): Promise<WebSocket> {
    if (this.stopped) throw new Error("Connection closed.");
    if (this.socket?.readyState === WebSocket.OPEN) return this.socket;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      const { wsUrl, ticket } = await this.bootstrap();
      if (this.stopped) throw new Error("Connection closed.");
      return await new Promise<WebSocket>((resolve, reject) => {
        const socket = new WebSocket(wsUrl, [
          "grill-me-v1",
          `ticket.${ticket}`,
        ]);
        const timer = setTimeout(() => {
          socket.close();
          reject(new Error("Local backend connection timed out."));
        }, 10000);
        socket.onopen = () => {
          clearTimeout(timer);
          this.socket = socket;
          this.statusChanged();
          this.attempt = 0;
          socket.send(JSON.stringify({ type: "subscribe" }));
          this.heartbeat = setInterval(() => {
            if (socket.readyState === WebSocket.OPEN)
              socket.send(JSON.stringify({ type: "ping" }));
          }, 20000);
          resolve(socket);
          for (const listener of this.listeners) listener();
        };
        socket.onmessage = (event) => {
          if (typeof event.data !== "string") return;
          let frame;
          try {
            frame = serverFrameSchema.parse(JSON.parse(event.data));
          } catch {
            socket.close(1002, "Invalid server frame");
            return;
          }
          if (frame.type === "changed") {
            for (const listener of this.listeners) listener(frame.tables);
            return;
          }
          if (frame.type === "pong") return;
          const pending = this.pending.get(frame.id);
          if (!pending) return;
          if (frame.type === "delta") {
            pending.delta?.(frame.delta);
            return;
          }
          this.pending.delete(frame.id);
          pending.cleanup();
          if (frame.type === "error")
            pending.reject(new RpcClientError(frame.error));
          else pending.resolve(frame.data);
        };
        socket.onerror = () => {
          clearTimeout(timer);
          reject(new Error("Cannot connect to the local backend."));
        };
        socket.onclose = () => {
          clearTimeout(timer);
          reject(new Error("Local backend disconnected."));
          if (this.socket === socket) {
            clearInterval(this.heartbeat);
            this.socket = undefined;
            this.statusChanged();
            reject(new Error("Local backend disconnected."));
            for (const pending of this.pending.values()) {
              pending.cleanup();
              pending.reject(
                new RpcClientError({
                  code: "CONNECTION_LOST",
                  message:
                    "Connection lost. Refresh the result before retrying this action.",
                  retryable: true,
                }),
              );
            }
            this.pending.clear();
          }
          this.scheduleReconnect();
        };
      });
    })().finally(() => {
      this.connecting = undefined;
    });
    return this.connecting;
  }
  private scheduleReconnect() {
    if (this.stopped || !this.listeners.size || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(
      () => {
        this.reconnectTimer = undefined;
        void this.connect().catch(() => this.scheduleReconnect());
      },
      Math.min(10000, 500 * 2 ** this.attempt++) + Math.random() * 200,
    );
  }
  async request<T>(
    call: ApiCall,
    options: { signal?: AbortSignal; onDelta?: (text: string) => void } = {},
  ): Promise<T> {
    options.signal?.throwIfAborted();
    const socket = await this.connect();
    options.signal?.throwIfAborted();
    const id = crypto.randomUUID();
    return await new Promise<T>((resolve, reject) => {
      const abort = () => {
        if (!this.pending.delete(id)) return;
        cleanup();
        if (socket.readyState === WebSocket.OPEN)
          socket.send(JSON.stringify({ type: "cancel", id }));
        reject(
          options.signal?.reason ?? new DOMException("Cancelled", "AbortError"),
        );
      };
      const timer = setTimeout(
        () => {
          if (!this.pending.delete(id)) return;
          cleanup();
          if (socket.readyState === WebSocket.OPEN)
            socket.send(JSON.stringify({ type: "cancel", id }));
          reject(
            new RpcClientError({
              code: "REQUEST_TIMEOUT",
              message:
                "The request timed out. Check its status before retrying.",
              retryable: true,
            }),
          );
        },
        call.stream ? 900000 : 60000,
      );
      const cleanup = () => {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", abort);
      };
      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        delta: options.onDelta,
        cleanup,
      });
      options.signal?.addEventListener("abort", abort, { once: true });
      try {
        socket.send(
          JSON.stringify({
            type: "request",
            id,
            version: PROTOCOL_VERSION,
            call,
          }),
        );
      } catch (error) {
        this.pending.delete(id);
        cleanup();
        reject(error);
      }
    });
  }
  onChange(listener: (tables?: string[]) => void) {
    this.listeners.add(listener);
    void this.connect().catch(() => this.scheduleReconnect());
    return () => {
      this.listeners.delete(listener);
    };
  }
  close() {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    clearInterval(this.heartbeat);
    for (const p of this.pending.values()) {
      p.cleanup();
      p.reject(new Error("Connection closed."));
    }
    this.pending.clear();
    this.socket?.close();
  }
}
