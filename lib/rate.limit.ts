// lib/rate-limit.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { auth } from '@clerk/nextjs/server';
import { headers } from 'next/headers';

// Initialize Redis (Upstash works great with Vercel)
const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!
});

// Create different rate limiters
export const anonLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(1, '24h'), // 1 scan per day for anonymous
    prefix: 'ratelimit:anon',
});

export const userLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(20, '24h'), // 2 scans per day for users
    prefix: 'ratelimit:user',
});

export const subscriptionLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(50, '24h'), // Essentially unlimited for subscribers
    prefix: 'ratelimit:sub',
});
export const gentleMinuteLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(3, '60s'),
    prefix: 'ratelimit:gentle:minute',
});

// Helper to get identifier
async function getIdentifier() {
    try {
        const { userId } = await auth();
        if (userId) return `user:${userId}`;

        // Fallback to IP + fingerprint for anonymous users
        const headersList = await headers();
        const ip = headersList.get('x-forwarded-for') || 'unknown';
        const userAgent = headersList.get('user-agent') || '';

        return `anon:${ip}:${userAgent.substring(0, 50)}`;
    } catch {
        const headersList = await headers();
        const ip = headersList.get('x-forwarded-for') || 'unknown';
        return `anon:${ip}`;
    }
}

// Check if user has subscription (simplified)
async function hasSubscription(_userId: string) {
    // Implement your actual subscription check
    return false; // Placeholder
}

// Main rate limit check
export async function checkRateLimit() {
    const identifier = await getIdentifier();

    // ✅ Add gentle minute-level limiting FIRST
    const minuteResult = await gentleMinuteLimiter.limit(identifier);
    if (!minuteResult.success) {
        return {
            allowed: false,
            message: "Please wait a moment between scans",
            reset: minuteResult.reset,
            remaining: 0,
            isAuthenticated: false, // We don't know auth status yet
            hasSubscription: false
        };
    }

    try {
        const { userId } = await auth();

        if (userId) {
            const isSubscribed = await hasSubscription(userId);
            const limiter = isSubscribed ? subscriptionLimiter : userLimiter;
            const result = await limiter.limit(identifier);

            return {
                allowed: result.success,
                limit: isSubscribed ? 50 : 2, // Changed from Infinity to 50
                remaining: result.remaining,
                reset: result.reset,
                isAuthenticated: true,
                hasSubscription: isSubscribed
            };
        }

        // Anonymous user
        const result = await anonLimiter.limit(identifier);
        return {
            allowed: result.success,
            limit: 1,
            remaining: result.remaining,
            reset: result.reset,
            isAuthenticated: false,
            hasSubscription: false
        };

    } catch (error) {
        console.error('Rate limit error:', error);
        // Fallback to anonymous rate limiting
        const result = await anonLimiter.limit(identifier);
        return {
            allowed: result.success,
            limit: 1,
            remaining: result.remaining,
            reset: result.reset,
            isAuthenticated: false,
            hasSubscription: false
        };
    }
}