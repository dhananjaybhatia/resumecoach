"use client";

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { useSession } from "@clerk/nextjs";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";

type SupabaseContextType = {
  supabase: SupabaseClient | null;
  isLoaded: boolean;
};

const SupabaseContext = createContext<SupabaseContextType>({
  supabase: null,
  isLoaded: false,
});

type Props = {
  children: ReactNode;
};

export default function SupabaseProvider({ children }: Props) {
  const { session } = useSession();
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const initializeSupabase = async () => {
      try {
        // Get the Clerk JWT token for Supabase
        let token = null;
        if (session) {
          try {
            token = await session.getToken({ template: "supabase" });
          } catch (error) {
            console.error("❌ Failed to get JWT token:", error);
            console.log(
              "💡 Make sure you have configured the 'supabase' JWT template in Clerk dashboard"
            );
          }
        }
        console.log("🔑 Supabase JWT Bridge:", {
          hasSession: !!session,
          hasToken: !!token,
          tokenPreview: token ? `${token.substring(0, 20)}...` : null,
          sessionUserId: session?.user?.id,
        });

        const client = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          {
            auth: {
              persistSession: false, // Prevent multiple instances
              autoRefreshToken: false,
            },
            ...(token && {
              global: {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              },
            }),
          }
        );

        if (!cancelled) {
          setSupabase(client);
          setIsLoaded(true);
        }
      } catch (error) {
        console.error("Error creating Supabase client:", error);
        // Fallback to anonymous client
        const client = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
            },
          }
        );
        if (!cancelled) {
          setSupabase(client);
          setIsLoaded(true);
        }
      }
    };

    initializeSupabase();

    return () => {
      cancelled = true;
    };
  }, [session]);

  return (
    <SupabaseContext.Provider value={{ supabase, isLoaded }}>
      {children}
    </SupabaseContext.Provider>
  );
}

export const useSupabase = () => {
  const context = useContext(SupabaseContext);
  if (context === undefined) {
    throw new Error("useSupabase must be used within a SupabaseProvider");
  }
  return context;
};
