'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { loadStripe } from '@stripe/stripe-js';

// Define the structure for a pricing plan
interface Plan {
  id: string;
  name: string;
  description: string;
  price: number; // Price in dollars
  tokens: number;
  priceId: string; // Stripe Price ID
}

// Ensure your Stripe publishable key is set in your environment variables
const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

// Available pricing plans - now using environment variables for price IDs
const plans: Plan[] = [
  {
    id: 'plan_100k',
    name: 'Starter Pack',
    description: '100,000 tokens',
    price: 2,
    tokens: 100000,
    // Ensure this environment variable is set in .env.local
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_100K || 'YOUR_STRIPE_PRICE_ID_100K_FALLBACK',
  },
  {
    id: 'plan_1m',
    name: 'Pro Pack',
    description: '1,000,000 tokens',
    price: 10,
    tokens: 1000000,
    // Ensure this environment variable is set in .env.local
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_1M || 'YOUR_STRIPE_PRICE_ID_1M_FALLBACK',
  },
];

// This is the actual page content that uses useSearchParams
const AccountSettingsContent = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    // Check for messages from Stripe redirect
    const sessionId = searchParams.get('session_id');
    const cancelled = searchParams.get('cancelled');

    if (sessionId) {
      setMessage('Payment successful! Your tokens will be updated shortly. Session ID: ' + sessionId);
      // Here, you might want to make an API call to verify the session
      // and update the UI more definitively, or rely on webhooks for backend processing.
      // For now, we clear the query parameters to avoid re-showing the message on refresh.
      router.replace('/account-settings', undefined);
    }

    if (cancelled) {
      setMessage('Checkout was cancelled. You can try again anytime.');
      router.replace('/account-settings', undefined);
    }
  }, [searchParams, router]);

  const handleSelectPlan = (plan: Plan) => {
    setSelectedPlan(plan);
    setQuantity(1); 
    setMessage(null); // Clear any previous messages
  };

  const handleCheckout = async () => {
    if (!selectedPlan) {
      alert('Please select a plan first.');
      return;
    }
    if (quantity <= 0) {
      alert('Quantity must be at least 1.');
      return;
    }
    if (!stripePromise) {
      alert('Stripe is not configured. Please add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY to your environment variables.');
      console.error('Stripe.js promise is null. Publishable key might be missing.');
      return;
    }

    setIsLoading(true);
    setMessage(null);

    try {
      const response = await fetch('/api/stripe/checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priceId: selectedPlan.priceId,
          quantity: quantity,
          // Using current origin for success and cancel URLs
          successUrl: `${window.location.origin}/account-settings?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${window.location.origin}/account-settings?cancelled=true`,
        }),
      });

      const { sessionId, error } = await response.json();

      if (error) {
        setMessage(`Error creating checkout session: ${error}`);
        setIsLoading(false);
        return;
      }

      if (sessionId) {
        const stripe = await stripePromise;
        if (!stripe) {
          setMessage('Stripe.js failed to load.');
          setIsLoading(false);
          return;
        }
        const { error: stripeError } = await stripe.redirectToCheckout({ sessionId });
        
        if (stripeError) {
          console.error("Stripe redirect error:", stripeError);
          setMessage(`Error redirecting to checkout: ${stripeError.message}`);
          setIsLoading(false);
        }
        // If redirectToCheckout is successful, the user is navigated away,
        // so setIsLoading(false) might not be reached here unless there's an immediate error.
      } else {
        setMessage('Failed to create Stripe checkout session. Session ID was not returned.');
        setIsLoading(false);
      }
    } catch (err) {
      console.error('Checkout error:', err);
      if (err instanceof Error) {
        setMessage(`An error occurred during checkout: ${err.message}`);
      } else {
        setMessage('An unknown error occurred during checkout.');
      }
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-4 md:p-8">
      <button
        onClick={() => router.push('/')}
        className="mb-6 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
      >
        &larr; Back to Home
      </button>
      <h1 className="text-3xl font-bold mb-8 text-center text-gray-800 dark:text-gray-100">Account Settings & Plans</h1>

      {message && (
        <div className={`p-4 mb-6 rounded-md text-center ${message.includes('Error') || message.includes('Failed') || message.includes('cancelled') ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-200' : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-200'}`}>
          {message}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-8">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`p-6 rounded-lg shadow-lg cursor-pointer transition-all duration-300 ease-in-out transform hover:scale-105 
                        ${selectedPlan?.id === plan.id ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/30 border-transparent' : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:shadow-xl'}`}
            onClick={() => handleSelectPlan(plan)}
          >
            <h2 className="text-2xl font-semibold mb-3 text-gray-700 dark:text-gray-200">{plan.name}</h2>
            <p className="text-lg text-gray-600 dark:text-gray-400 mb-2">{plan.description}</p>
            <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 mb-4">${plan.price}</p>
            <button
              onClick={(e) => {
                e.stopPropagation(); // Prevent plan selection when clicking button
                setSelectedPlan(plan);
                // Potentially open a modal for quantity or directly checkout
                handleCheckout();
              }}
              disabled={isLoading || selectedPlan?.id !== plan.id || !stripePromise}
              className={`w-full mt-4 px-6 py-3 rounded-md font-semibold transition-colors
                          ${selectedPlan?.id === plan.id && stripePromise ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 cursor-not-allowed'}
                          disabled:opacity-50`}
            >
              {isLoading && selectedPlan?.id === plan.id ? 'Processing...' : `Buy ${plan.name}`}
            </button>
          </div>
        ))}
      </div>

      {selectedPlan && (
        <div className="mt-12 p-6 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700">
          <h3 className="text-2xl font-semibold mb-6 text-gray-700 dark:text-gray-200">Confirm Your Purchase</h3>
          <div className="mb-6">
            <p className="text-lg"><span className="font-semibold">Selected Plan:</span> {selectedPlan.name}</p>
            <p className="text-lg"><span className="font-semibold">Tokens:</span> {selectedPlan.tokens.toLocaleString()}</p>
            <p className="text-lg"><span className="font-semibold">Price per unit:</span> ${selectedPlan.price.toFixed(2)}</p>
          </div>
          <div className="mb-6">
            <label htmlFor="quantity" className="block text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
              Quantity:
            </label>
            <input
              type="number"
              id="quantity"
              name="quantity"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value, 10))}
              className="w-full md:w-1/3 p-3 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
          <div className="mb-2">
            <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">
              Total: ${(selectedPlan.price * quantity).toFixed(2)}
            </p>
          </div>
          <button
            onClick={handleCheckout}
            disabled={isLoading || quantity <= 0 || !stripePromise}
            className="w-full mt-4 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-md font-semibold transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Processing...' : 
              !stripePromise ? 'Stripe Loading...' : `Proceed to Checkout for ${(selectedPlan.price * quantity).toFixed(2)}`
            }
          </button>
        </div>
      )}
    </div>
  );
};

// The main page component now wraps AccountSettingsContent in Suspense
const AccountSettingsPage = () => {
  return (
    <Suspense fallback={<div className="container mx-auto p-4 md:p-8 text-center">Loading account details...</div>}>
      <AccountSettingsContent />
    </Suspense>
  );
};

export default AccountSettingsPage; 