import { NextRequest, NextResponse } from "next/server";
import { debug } from "@/lib/debug";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(request: NextRequest) {
    try {
        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const client = await clerkClient();
        const user = await client.users.getUser(userId);

        const email =
            user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)
                ?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? "";

        const name =
            [user.firstName, user.lastName].filter(Boolean).join(" ") ||
            user.username ||
            "";

        const avatar_url = user.imageUrl || "";

        debug("🔄 Syncing user to Supabase:", { userId, email, name });

        // First, try to find existing user by user_id
        const { data: existingUser } = await supabaseAdmin
            .from("users")
            .select("*")
            .eq("user_id", userId)
            .single();

        let data, error;

        if (existingUser) {
            // Update existing user
            debug("📝 Updating existing user:", existingUser.id);
            const result = await supabaseAdmin
                .from("users")
                .update({
                    email,
                    name,
                    avatar_url,
                    updated_at: new Date().toISOString(),
                })
                .eq("user_id", userId)
                .select()
                .single();
            data = result.data;
            error = result.error;
        } else {
            // Insert new user
            debug("➕ Creating new user");
            const result = await supabaseAdmin
                .from("users")
                .insert({
                    user_id: userId,
                    email,
                    name,
                    avatar_url,
                    updated_at: new Date().toISOString(),
                })
                .select()
                .single();
            data = result.data;
            error = result.error;

            // If insert fails due to email constraint, try to find and update the existing user
            if (error && error.message.includes("duplicate key value violates unique constraint")) {
                debug("🔄 Email already exists, finding existing user by email");
                const { data: existingByEmail } = await supabaseAdmin
                    .from("users")
                    .select("*")
                    .eq("email", email)
                    .single();

                if (existingByEmail) {
                    debug("📝 Updating existing user by email:", existingByEmail.id);
                    const updateResult = await supabaseAdmin
                        .from("users")
                        .update({
                            user_id: userId,
                            name,
                            avatar_url,
                            updated_at: new Date().toISOString(),
                        })
                        .eq("email", email)
                        .select()
                        .single();
                    data = updateResult.data;
                    error = updateResult.error;
                }
            }
        }

        if (error) {
            console.error("Database error:", error);
            return NextResponse.json(
                {
                    error: "Database error",
                    details: error.message,
                    code: error.code,
                    hint: error.hint
                },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true, data });
    } catch (error: unknown) {
        console.error("Sync user error:", error);
        return NextResponse.json(
            {
                error: "Internal server error",
                message: error instanceof Error ? error.message : "Unknown error"
            },
            { status: 500 }
        );
    }
}
