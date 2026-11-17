import type { ChallengeModel } from "../challenges/challenge.model";
import { requireChallenge } from "../challenges/challenge.utils";
import type { ProfileService } from "../profiles/profile.service";
import type { MessageModel } from "./message.model";
import { toMessage } from "./message.utils";

/** Read-only compatibility access to archived practice conversations. */
export function createMessageService({
  challenges,
  messages,
  profiles,
}: {
  challenges: ChallengeModel;
  messages: MessageModel;
  profiles: ProfileService;
}) {
  async function owned(id: string, profileId: string) {
    await profiles.assertExists(profileId);
    return requireChallenge(await challenges.findOwned(id, profileId));
  }
  return {
    assertAccess: owned,
    async list(challengeId: string, profileId: string) {
      const challenge = await owned(challengeId, profileId);
      return (await messages.findRowsByChallenge(challenge.id)).map(toMessage);
    },
  };
}
export type MessageService = ReturnType<typeof createMessageService>;
