# Stripe Setup Guide

## 1. Create Stripe Products and Prices

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/test/products)
2. Click "Create product"
3. Set product name: "Unlimited Resume Analysis"
4. Set price: $9.99/month (recurring)
5. Copy the Price ID (starts with `price_`)

## 2. Environment Variables

Add these to your `.env.local` file:

```env
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

## 3. Get Stripe Keys

1. Go to [Stripe API Keys](https://dashboard.stripe.com/test/apikeys)
2. Copy your publishable and secret keys
3. Add them to `.env.local`

## 4. Create Webhook Endpoint

1. Go to [Stripe Webhooks](https://dashboard.stripe.com/test/webhooks)
2. Click "Add endpoint"
3. Set URL to: `https://yourdomain.com/api/webhooks/stripe`
4. Select these events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Copy the webhook secret and add to `.env.local`

## 5. Update Price ID

In `/app/subscription/page.tsx`, update the priceId:
```typescript
priceId: 'price_YOUR_ACTUAL_PRICE_ID', // Replace with your actual price ID
```

## 6. Test the Integration

1. Start your development server: `npm run dev`
2. Go to `/subscription`
3. Click "Start Unlimited Analysis"
4. Use Stripe test card: `4242 4242 4242 4242`
5. Complete the checkout process

## Test Cards

- **Success**: 4242 4242 4242 4242
- **Declined**: 4000 0000 0000 0002
- **Requires Authentication**: 4000 0025 0000 3155
