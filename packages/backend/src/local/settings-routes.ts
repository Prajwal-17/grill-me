import { Hono } from "hono";
import { z } from "zod";
import {
  providerInputSchema,
  modelSelectionSchema,
  runtimeSettingsSchema,
  workspacePreferenceSchema,
  credentialStorageSchema,
} from "@repo/backend/shared/contracts";
import { AppError } from "../shared/errors/app-error";
import { parseInput, readJson } from "../shared/http/validation";
import type { SettingsService } from "./settings";

const inactive = () =>
  new AppError(
    "INTEGRATION_INACTIVE",
    "CLI integrations are inactive. Select an API provider in Settings → Providers.",
    503,
  );

export function settingsRoutes(service: SettingsService) {
  const routes = new Hono();
  routes.get("/", async (c) => c.json({ data: await service.get() }));
  routes.get("/provider-status", async (c) =>
    c.json({ data: await service.health() }),
  );
  routes.get("/catalog", async (c) =>
    c.json({ data: await service.catalog() }),
  );
  routes.post("/providers/:id/enabled", async (c) => {
    const { enabled } = parseInput(
      z.object({ enabled: z.boolean() }),
      await readJson(c.req.raw),
    );
    return c.json({
      data: await service.setProviderEnabled(
        parseInput(z.string().uuid(), c.req.param("id")),
        enabled,
      ),
    });
  });
  routes.get("/providers/:id/models", async (c) =>
    c.json({
      data: await service.models(
        parseInput(z.string().uuid(), c.req.param("id")),
      ),
    }),
  );
  routes.get("/providers/:id/connection", async (c) => {
    const id = parseInput(z.string().uuid(), c.req.param("id"));
    const provider = await service.snapshot(id);
    if (provider.kind !== "openai") throw inactive();
    const models = await service.models(id);
    const health = await service.testProvider(id);
    return c.json({
      data: {
        installed: true,
        connected: health.ok,
        authenticated: health.ok,
        version: null,
        binaryPath: null,
        message: health.message,
        ...(health.code ? { code: health.code } : {}),
        models,
      },
    });
  });
  routes.post("/providers/:id/login", async (c) => {
    const id = parseInput(z.string().uuid(), c.req.param("id"));
    const provider = await service.snapshot(id);
    if (provider.kind !== "openai") throw inactive();
    throw new AppError(
      "PROVIDER_LOGIN_UNSUPPORTED",
      "API connections use a saved key. Replace it in Settings → Providers.",
      400,
    );
  });
  routes.post("/providers/:id/connect", async (c) =>
    c.json({
      data: await service.connectProvider(
        parseInput(z.string().uuid(), c.req.param("id")),
      ),
    }),
  );
  routes.post("/providers/:id/disconnect", async (c) => {
    const id = parseInput(z.string().uuid(), c.req.param("id"));
    return c.json({ data: await service.disconnectProvider(id) });
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
  routes.post("/default-selection", async (c) => {
    const input = parseInput(
      z.object({ selection: modelSelectionSchema.nullable() }),
      await readJson(c.req.raw),
    );
    return c.json({
      data: await service.saveDefaultSelection(input.selection),
    });
  });
  routes.post("/runtime", async (c) =>
    c.json({
      data: await service.saveRuntime(
        parseInput(runtimeSettingsSchema, await readJson(c.req.raw)),
      ),
    }),
  );
  routes.post("/workspace", async (c) =>
    c.json({
      data: await service.saveWorkspace(
        parseInput(workspacePreferenceSchema, await readJson(c.req.raw)),
      ),
    }),
  );
  routes.post("/import", async (c) => {
    const input = parseInput(
      z.object({ storage: credentialStorageSchema }),
      await readJson(c.req.raw),
    );
    return c.json({ data: await service.migrateLegacy(input.storage) });
  });
  return routes;
}
