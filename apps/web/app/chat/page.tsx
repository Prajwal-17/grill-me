import { redirect } from "next/navigation";
import { ChatPage } from "../../features/chat/pages/chat-page";

type ChatRouteProps = {
  searchParams: Promise<{
    id?: string | string[];
    new?: string | string[];
  }>;
};

export default async function Page({ searchParams }: ChatRouteProps) {
  const query = await searchParams;
  const challengeId = Array.isArray(query.id) ? query.id[0] : query.id;
  const createNewValue = Array.isArray(query.new) ? query.new[0] : query.new;

  if (createNewValue === "1" || !challengeId) redirect("/");
  return <ChatPage key={challengeId} challengeId={challengeId} />;
}
