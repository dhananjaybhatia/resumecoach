

// middleware.ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { debug } from '@/lib/debug';

// Define public routes that don't need authentication
const isPublicRoute = createRouteMatcher([
    '/',
    '/results',
    '/resume', // Resume upload page - accessible to anonymous users
    '/subscription', // Subscription page - accessible to anonymous users
    '/test', // Test page - accessible to anonymous users
    '/sign-in(.*)', // Clerk sign-in page and all its sub-routes
    '/api/analyze-resume', // Public API route
    '/api/webhook/stripe', // Stripe webhook
    '/api/clerk/webhook'   // Clerk webhook
]);

export default clerkMiddleware(async (auth, req) => {
    const { pathname } = req.nextUrl;

    // Debug logging
    debug("🔍 Middleware:", {
        pathname,
        isPublic: isPublicRoute(req),
        hasAuth: !!auth
    });

    // Protect all routes except public ones
    if (!isPublicRoute(req)) {
        await auth.protect();
    }
});

export const config = {
    matcher: [
        // Skip Next.js internals and all static files, unless found in search params
        '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
        // Always run for API routes
        '/(api|trpc)(.*)',
    ],
};

