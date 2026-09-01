import { ChatApp } from "@/components/chat/chat-app";
import { requirePageUser } from "@/lib/session";

export default async function ConversationChatPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const user = await requirePageUser();
  const { conversationId } = await params;
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Live chat</h1>
      <ChatApp userId={user.id} initialConversationId={conversationId} />
    </div>
  );
}
