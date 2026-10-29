import { Hono } from "hono";
import { z } from "zod";
import { providerInputSchema, runtimeSettingsSchema } from "@repo/contracts";
import { parseInput, readJson } from "../shared/http/validation";
import type { SettingsService } from "./settings";
export function settingsRoutes(service: SettingsService) {
  const routes = new Hono();
  routes.get("/", async (c) => c.json({ data: await service.get() }));
  routes.post("/providers", async (c) =>
    c.json({
      data: await service.saveProvider(
        parseInput(providerInputSchema, await readJson(c.req.raw)),
      ),
    }),
  );
  routes.delete("/providers/:id", async (c) =>
    c.json({
      data: await service.removeProvider(
        parseInput(z.string().uuid(), c.req.param("id")),
      ),
    }),
  );
  routes.post("/providers/:id/test", async (c) =>
    c.json({
      data: await service.testProvider(
        parseInput(z.string().uuid(), c.req.param("id")),
      ),
    }),
  );
  routes.post("/active-provider", async (c) => {
    const input = parseInput(
      z.object({ id: z.string().uuid().nullable() }),
      await readJson(c.req.raw),
    );
    return c.json({ data: await service.activateProvider(input.id) });
  });
  routes.post("/runtime", async (c) =>
    c.json({
      data: await service.saveRuntime(
        parseInput(runtimeSettingsSchema, await readJson(c.req.raw)),
      ),
    }),
  );
  routes.post("/import", async (c) => {
    const input = parseInput(
      z.object({ storage: z.enum(["keyring", "session"]) }),
      await readJson(c.req.raw),
    );
    return c.json({ data: await service.migrateLegacy(input.storage) });
  });
  return routes;
}
