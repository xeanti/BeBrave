import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

export default function AuthCallback() {
  const [status, setStatus] = useState('Confirming your email...');

  useEffect(() => {
    async function finishConfirmation() {
      const { data } = await supabase.auth.getSession();

      if (data?.session) {
        await supabase.auth.signOut();

        setStatus('Email confirmed successfully. You may now log in to MotoFix.');
        return;
      }

      setStatus('Email confirmed. You may now log in to MotoFix.');
    }

    finishConfirmation();
  }, []);

  return (
    <div className="min-h-screen bg-dark-900 px-4 py-16 text-white">
      <div className="mx-auto max-w-md rounded-3xl border border-dark-700 bg-dark-800 p-8 text-center">
        <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-accent-500 text-3xl">
          ✓
        </div>

        <h1 className="text-2xl font-black">MotoFix Email Confirmation</h1>

        <p className="mt-4 text-sm leading-6 text-gray-300">
          {status}
        </p>

        <Link
          to="/login"
          className="mt-6 inline-flex rounded-2xl bg-accent-500 px-5 py-3 text-sm font-black text-dark-900"
        >
          Go to Login
        </Link>
      </div>
    </div>
  );
}