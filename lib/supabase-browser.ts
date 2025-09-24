// lib/supabase-browser.ts - Utility functions for client-side Supabase operations
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Create a browser client for anonymous operations
export const createSupabaseBrowser = (): SupabaseClient => {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
};

// Create a browser client with JWT token for authenticated operations
export const createSupabaseBrowserWithAuth = async (token: string): Promise<SupabaseClient> => {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    }
  );
};
