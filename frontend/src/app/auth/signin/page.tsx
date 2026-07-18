import { Suspense } from "react";

import BackendWarmupGate from "@/components/warmup/BackendWarmupGate";
import SignInClient from "./SignInClient";

export default function SignInPage() {
  return (
    <BackendWarmupGate>
      <Suspense fallback={<SignInFallback />}>
        <SignInClient />
      </Suspense>
    </BackendWarmupGate>
  );
}

function SignInFallback() {
  return (
    <>
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
            animation: "signin-fallback-spin 0.8s linear infinite",
          }}
        />
      </div>
      <style>{`@keyframes signin-fallback-spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
