import { AppError } from "../../../shared/errors/app-error";

export type Release = () => void;

export function createLimiter(max = 2) {
  let active = 0;
  const waiters: {
    resolve: (release: Release) => void;
    reject: (error: unknown) => void;
    signal?: AbortSignal;
    abort: () => void;
  }[] = [];

  function release() {
    active--;
    const next = waiters.shift();
    if (!next) return;
    next.signal?.removeEventListener("abort", next.abort);
    active++;
    next.resolve(release);
  }

  return {
    acquire(signal?: AbortSignal): Promise<Release> {
      if (signal?.aborted)
        return Promise.reject(
          new AppError("REQUEST_CANCELLED", "The request was cancelled.", 499),
        );
      if (active < max) {
        active++;
        return Promise.resolve(release);
      }
      return new Promise((resolve, reject) => {
        const waiter = {
          resolve,
          reject,
          signal,
          abort: () => {
            const index = waiters.indexOf(waiter);
            if (index >= 0) waiters.splice(index, 1);
            reject(
              new AppError(
                "REQUEST_CANCELLED",
                "The request was cancelled.",
                499,
              ),
            );
          },
        };
        signal?.addEventListener("abort", waiter.abort, { once: true });
        waiters.push(waiter);
      });
    },
  };
}

export function createResourceLocks() {
  const active = new Set<string>();
  return {
    acquire(key: string): Release {
      if (active.has(key))
        throw new AppError(
          "AGENT_RESOURCE_BUSY",
          "A response is already running for this conversation. Stop it or wait for it to finish.",
          409,
          true,
        );
      active.add(key);
      return () => active.delete(key);
    },
  };
}
