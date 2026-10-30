export const entries: { service: string; options: unknown }[] = [];
const values = new Map<string, string>();
export class AsyncEntry {
  private key: string;
  constructor(service: string, id: string, options?: unknown) {
    entries.push({ service, options });
    this.key = `${service}:${id}`;
  }
  async setPassword(value: string) {
    values.set(this.key, value);
  }
  async getPassword() {
    return values.get(this.key) ?? null;
  }
  async deletePassword() {
    values.delete(this.key);
  }
}
