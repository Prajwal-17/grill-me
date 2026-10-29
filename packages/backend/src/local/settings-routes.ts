import { Hono } from "hono";
import { z } from "zod";
import { providerInputSchema, runtimeSettingsSchema } from "@repo/contracts";
import { parseInput, readJson } from "../shared/http/validation";
import type { SettingsService } from "./settings";
import type { CliProviders } from "./providers";
export function settingsRoutes(service: SettingsService, cli: CliProviders) {
  const routes = new Hono();
  routes.get("/", async (c) => c.json({ data: await service.get() }));
  routes.get("/providers/:id/connection", async (c) =>
    c.json({
      data: await cli.status(
        await service.provider(
          parseInput(z.string().uuid(), c.req.param("id")),
        ),
      ),
    }),
  );
  routes.post("/providers/:id/login", async (c) => {
    const provider = await service.provider(
      parseInput(z.string().uuid(), c.req.param("id")),
    );
    const input = parseInput(
      z.object({
        providerId: z.string().max(160).optional(),
        methodIndex: z.number().int().min(0).max(50).optional(),
        key: z.string().max(8192).optional(),
        code: z.string().max(4096).optional(),
        complete: z.boolean().optional(),
      }),
      await readJson(c.req.raw),
    );
    return c.json({ data: await cli.signIn(provider, input) });
  });
  routes.post("/providers/:id/disconnect", async (c) => {
    const id = parseInput(z.string().uuid(), c.req.param("id"));
    await service.provider(id);
    cli.disconnect(id);
    const settings = await service.get();
    return c.json({
      data:
        settings.activeProviderId === id
          ? await service.activateProvider(null)
          : settings,
    });
  });
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
