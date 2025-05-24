import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { headers } from 'next/headers';
// Use the Supabase client that uses the SERVICE_ROLE_KEY for backend updates
import supabaseAdmin from '../../../../lib/supabaseServer'; // Ensure this path is correct for your service role client

// Initialize Stripe with your secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-04-30.basil', // Match your checkout session API version
  typescript: true,
});

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

// Define a mapping from Stripe Price ID to token amount
// Ensure these Price IDs match what's in your Stripe dashboard and .env.local
const priceIdToTokens: Record<string, number> = {
  [process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_100K || '']: 100000,
  [process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_1M || '']: 1000000,
};

export async function POST(req: NextRequest) {
  const body = await req.text();
  const headerPayload = await headers();
  const signature = headerPayload.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Webhook Error: Missing stripe-signature header' }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, endpointSecret);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown webhook signature verification error';
    console.error(`Webhook signature verification failed: ${errorMessage}`);
    return NextResponse.json({ error: `Webhook Error: ${errorMessage}` }, { status: 400 });
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object as Stripe.Checkout.Session;
      console.log('Checkout session completed:', session.id);

      // Retrieve metadata we passed during checkout
      const userId = session.metadata?.userId;
      const priceId = session.metadata?.priceId; // This is the Stripe Price ID of the item bought
      const quantity = session.metadata?.quantity ? parseInt(session.metadata.quantity, 10) : 1;

      if (!userId || !priceId) {
        console.error('Webhook Error: Missing userId or priceId in session metadata for session:', session.id);
        return NextResponse.json({ error: 'Missing metadata' }, { status: 400 });
      }

      const tokensToAdd = (priceIdToTokens[priceId] || 0) * quantity;

      if (tokensToAdd === 0) {
        console.error(`Webhook Error: No token amount configured for priceId ${priceId} or priceId not found.`);
        // Still acknowledge the webhook to Stripe, but log the error
        return NextResponse.json({ received: true, error: 'Unconfigured priceId' }, { status: 200 });
      }

      try {
        // Fetch the user's current paid_tokens_remaining
        const { data: userData, error: fetchError } = await supabaseAdmin
          .from('users') // Ensure 'users' is your correct table name
          .select('paid_tokens_remaining')
          .eq('id', userId)
          .single();

        if (fetchError) {
          console.error(`Webhook Supabase Error: Could not fetch user ${userId} for token update:`, fetchError);
          return NextResponse.json({ error: 'Supabase fetch error' }, { status: 500 });
        }

        const currentTokens = userData?.paid_tokens_remaining || 0;
        const newTotalTokens = currentTokens + tokensToAdd;

        // Update the user's token count
        const { error: updateError } = await supabaseAdmin
          .from('users')
          .update({ paid_tokens_remaining: newTotalTokens })
          .eq('id', userId);

        if (updateError) {
          console.error(`Webhook Supabase Error: Could not update tokens for user ${userId}:`, updateError);
          return NextResponse.json({ error: 'Supabase update error' }, { status: 500 });
        }

        console.log(`Successfully added ${tokensToAdd} tokens to user ${userId}. New total: ${newTotalTokens}`);
      } catch (dbError) {
        const dbErrorMessage = dbError instanceof Error ? dbError.message : 'Unknown database operation error';
        console.error('Webhook Supabase DB operation failed:', dbErrorMessage);
        return NextResponse.json({ error: `Database operation error: ${dbErrorMessage}` }, { status: 500 });
      }
      break;
    
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      console.log(`PaymentIntent for ${paymentIntent.amount} was successful!`);
      // Handle other successful payment-related events if necessary
      break;

    // ... handle other event types if needed

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  return NextResponse.json({ received: true });
} 