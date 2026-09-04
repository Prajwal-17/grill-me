import type { Context } from "hono";
import { parseInput, readJson } from "../../shared/http/validation";
import { startProfileRequestSchema } from "./profile.schema";
import type { ProfileService } from "./profile.service";

export function createProfileController(service: ProfileService) {
  return {
    start: async (c: Context) => {
      const input = parseInput(
        startProfileRequestSchema,
        await readJson(c.req.raw),
      );
      return c.json({ data: service.start(input.email) });
    },
  };
}

export type ProfileController = ReturnType<typeof createProfileController>;
