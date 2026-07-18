"use client";

import AuthenticatedChatShell from "@/components/chat/AuthenticatedChatShell";
import BackendWarmupGate from "@/components/warmup/BackendWarmupGate";

export default function ChatPage() {
  return (
    <BackendWarmupGate>
      <AuthenticatedChatShell />
    </BackendWarmupGate>
  );
}
