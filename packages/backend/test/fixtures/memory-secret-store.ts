import type { SecretStore } from "@repo/backend/local/secrets";

export function memorySecretStore(): SecretStore {
  const secrets = new Map<string, string>();
  return {
    get: async (id) => secrets.get(id),
    set: async (id, value) => {
      secrets.set(id, value);
    },
    remove: async (id) => {
      secrets.delete(id);
    },
    status: async () => ({
      available: true,
      message: "Test credential store.",
    }),
  };
}
