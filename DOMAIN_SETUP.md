# Domain Configuration for resumecoach.au

## Environment Variables to Add to .env.local

Add these lines to your `.env.local` file:

```env
# Domain Configuration
NEXT_PUBLIC_APP_URL=https://resumecoach.au
NEXT_PUBLIC_DOMAIN=resumecoach.au

# Update existing Clerk URLs to use your domain
NEXT_PUBLIC_CLERK_SIGN_IN_URL=https://resumecoach.au/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=https://resumecoach.au/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=https://resumecoach.au/
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=https://resumecoach.au/
```

## External Service Configuration

### 1. Clerk Dashboard
- Go to: https://dashboard.clerk.com
- Navigate to: "Domains" in your project settings
- Add: `resumecoach.au` to allowed domains
- Update: Sign-in/Sign-up URLs to use your domain

### 2. Stripe Dashboard (if using)
- Go to: https://dashboard.stripe.com/settings/domains
- Add: `resumecoach.au` to allowed domains
- Update: Webhook endpoints to use your domain

### 3. Deployment Platform
- **Vercel**: Add `resumecoach.au` as custom domain
- **Netlify**: Configure custom domain
- **Other**: Update your hosting platform settings

### 4. DNS Configuration
Update your DNS records at your domain registrar:
- **A Record**: Point to your hosting provider's IP
- **CNAME**: Point `www.resumecoach.au` to `resumecoach.au`

## Next.js Configuration

The domain has been added to `next.config.ts` with:
- Default environment variables
- Security headers
- Domain-specific configurations

## Priority Order

1. ✅ **Next.js Config** - Already updated
2. 🔄 **Environment Variables** - Add to .env.local
3. 🔄 **Clerk Dashboard** - Add domain to allowed list
4. 🔄 **Deployment Platform** - Configure custom domain
5. 🔄 **DNS Records** - Point domain to your hosting
6. 🔄 **Stripe Dashboard** - Add domain (if using payments)
