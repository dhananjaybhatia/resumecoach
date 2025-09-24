// lib/supabase.ts (server-only)
import { createClient } from '@supabase/supabase-js';

export const supabaseAdmin = (() => {
    if (typeof window !== 'undefined') throw new Error('server-only');
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!, // server env ONLY
        { auth: { persistSession: false, autoRefreshToken: false } }
    );
})();


// export const supabaseClient = async (supabaseToken) => {
    
//     const supabase = createClient(
 
//         process.env.NEXT_PUBLIC_SUPABASE_URL!,
//         process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
//             global: {
//                 headers: {
//                     Authorization: `Bearer ${supabaseToken}`,
//                 },
//             },
//         }
//     ); return supabase;
// }();
