import { apiRequest } from "../../../shared/lib/api-client";
import type { Profile } from "../../../shared/types/api";

export function startProfile(email: string) {
  return apiRequest<Profile>("/profiles/start", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}
