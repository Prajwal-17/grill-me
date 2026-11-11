import { Navigate, useSearchParams } from "react-router";
import { ChatPage } from "@/features/chat/pages/chat-page";

export function Component() {
  const [params] = useSearchParams();
  const challengeId = params.get("id");
  if (params.get("new") === "1" || !challengeId)
    return <Navigate to="/" replace />;
  return <ChatPage key={challengeId} challengeId={challengeId} />;
}
