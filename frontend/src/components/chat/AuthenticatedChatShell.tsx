"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import ChatLayout from "@/components/chat/ChatLayout";

export default function AuthenticatedChatShell() {
  const router = useRouter();
  const [user, setUser] = useState<{ email?: string; id?: string } | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/auth/signin");
      } else {
        setUser(data.session.user);
        setChecking(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.replace("/auth/signin");
      } else {
        setUser(session.user);
        setChecking(false);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [router]);

  if (checking) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#0d0d10",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            border: "2px solid rgba(124,106,255,0.2)",
            borderTopColor: "#7c6aff",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return <ChatLayout user={user} />;
}
