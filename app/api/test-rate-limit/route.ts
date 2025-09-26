// app/api/test-rate-limit/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate.limit';
import { auth } from '@clerk/nextjs/server';
import { headers } from 'next/headers';

export async function GET(request: NextRequest) {
    try {
        // Get current auth status
        const { userId } = await auth();
        const headersList = await headers();

        // Get IP for anonymous users
        const ip = headersList.get('x-forwarded-for') ||
            headersList.get('x-real-ip') ||
            headersList.get('cf-connecting-ip') ||
            'unknown';

        // Check rate limit
        const rateLimitResult = await checkRateLimit();

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            auth: {
                isAuthenticated: !!userId,
                userId: userId || null,
                ip: ip.split(',')[0].trim()
            },
            rateLimit: {
                allowed: rateLimitResult.allowed,
                remaining: rateLimitResult.remaining,
                limit: rateLimitResult.limit,
                reset: rateLimitResult.reset,
                resetDate: new Date(rateLimitResult.reset).toISOString(),
                isAuthenticated: rateLimitResult.isAuthenticated,
                hasSubscription: rateLimitResult.hasSubscription
            },
            message: rateLimitResult.allowed
                ? '✅ Rate limit check passed'
                : '❌ Rate limit exceeded'
        });

    } catch (error) {
        console.error('Rate limit test error:', error);
        return NextResponse.json({
            success: false,
            error: error.message,
            stack: error.stack
        }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        // Simulate a resume analysis request
        const rateLimitResult = await checkRateLimit();

        if (!rateLimitResult.allowed) {
            return NextResponse.json({
                success: false,
                error: 'Rate limit exceeded',
                rateLimit: rateLimitResult
            }, { status: 429 });
        }

        // If rate limit passes, simulate processing
        return NextResponse.json({
            success: true,
            message: '✅ Rate limit check passed - would process resume analysis',
            rateLimit: rateLimitResult,
            simulatedProcessing: {
                status: 'completed',
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Rate limit test error:', error);
        return NextResponse.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
}
