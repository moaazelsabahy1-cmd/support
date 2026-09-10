import { ChatApp } from "@/components/chat/chat-app";
import { requirePageUser } from "@/lib/session";

export default async function ChatPage() {
  const user = await requirePageUser();
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Chat</h1>
      <ChatApp userId={user.id} role={user.role} />
    </div>
  );
}
