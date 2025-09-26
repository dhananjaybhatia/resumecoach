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
    limiter: Ratelimit.slidingWindow(2, '24h'), // 2 free scans per day for signed-in users
    prefix: 'ratelimit:user',
});
export const subscriptionLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(1000, '24h'), // Unlimited scans for subscribers
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

        // For anonymous users, use IP + User-Agent for better tracking
        const headersList = await headers();
        const ip = headersList.get('x-forwarded-for') ||
            headersList.get('x-real-ip') ||
            headersList.get('cf-connecting-ip') ||
            'unknown';
        const userAgent = headersList.get('user-agent') || 'unknown';

        // Create a more stable identifier for anonymous users
        // Use first part of IP and first 30 chars of user agent
        const cleanIp = ip.split(',')[0].trim();
        const cleanUserAgent = userAgent.substring(0, 30).replace(/[^a-zA-Z0-9]/g, '');

        return `anon:${cleanIp}:${cleanUserAgent}`;
    } catch {
        const headersList = await headers();
        const ip = headersList.get('x-forwarded-for') || 'unknown';
        return `anon:${ip.split(',')[0].trim()}`;
    }
}

// Check if user has subscription using Clerk's access control
async function hasSubscription() {
    try {
        const { has } = await auth();
        // Check if user has the 'unlimited_scans' feature
        return has({ feature: 'unlimited_scans' });
    } catch (error) {
        console.error('Error checking subscription:', error);
        return false;
    }
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
            const isSubscribed = await hasSubscription();
            const limiter = isSubscribed ? subscriptionLimiter : userLimiter;
            const result = await limiter.limit(identifier);

            return {
                allowed: result.success,
                limit: isSubscribed ? 1000 : 1, // 1 free scan or unlimited for subscribers
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