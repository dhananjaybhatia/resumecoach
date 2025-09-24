"use client";

import { useUser } from "@clerk/nextjs";
import { useEffect, useRef } from "react";

export default function UserSyncer() {
  const { isLoaded, isSignedIn, user } = useUser();
  const didSyncFor = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user) return;
    if (didSyncFor.current === user.id) return; // avoid duplicate calls in this session
    didSyncFor.current = user.id;

    (async () => {
      try {
        const res = await fetch("/api/sync-user", { method: "POST" });
        const ct = res.headers.get("content-type") || "";
        const body = ct.includes("application/json")
          ? await res.json()
          : await res.text();

        if (!res.ok) {
          console.error("❌ sync-user failed", { status: res.status, body });
        } else {
          console.log("✅ synced user", body);
        }
      } catch (e) {
        console.error("❌ sync-user network error", e);
      }
    })();
  }, [isLoaded, isSignedIn, user?.id]);

  return null;
}
