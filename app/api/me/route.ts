export const runtime = "nodejs";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
    const { userId, sessionClaims } = auth();
    if (!userId) return new Response("Unauthorized", { status: 401 });

    const email =
        (sessionClaims?.email as string) ||
        (sessionClaims?.email_addresses?.[0] as string) ||
        "unknown@example.com";

    const { data, error } = await supabaseAdmin
        .from("users")
        .upsert({ clerk_user_id: userId, email }, { onConflict: "clerk_user_id" })
        .select()
        .single();

    if (error) return new Response(error.message, { status: 500 });
    return Response.json(data);
}
