import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const AuthContext = createContext(null);

function cleanPhone(value = '') {
  return String(value || '').replace(/\D/g, '');
}

function isInactiveProfile(profile) {
  return profile?.is_active === false;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [inactiveError, setInactiveError] = useState('');

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;

      setSession(session);

      if (session?.user) {
        await fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!mounted) return;

        setSession(session);

        if (session?.user) {
          await fetchProfile(session.user.id);
        } else {
          setProfile(null);
          setLoading(false);
        }
      }
    );

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function handleInactiveAccount() {
    setInactiveError(
      'Your account has been deactivated. Please contact MotoFix support or the shop administrator.'
    );

    setProfile(null);
    setSession(null);

    await supabase.auth.signOut();
  }

  async function fetchProfile(userId) {
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error fetching profile:', error.message);

        if (error.code === 'PGRST116') {
          const { data: userData } = await supabase.auth.getUser();

          if (userData?.user) {
            await supabase.from('profiles').insert({
              id: userId,
              first_name: userData.user.user_metadata?.first_name || '',
              last_name: userData.user.user_metadata?.last_name || '',
              email: userData.user.email || '',
              phone: cleanPhone(userData.user.user_metadata?.phone || ''),
              role: 'customer',
              is_active: true,
            });

            const { data: retryData } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', userId)
              .single();

            if (isInactiveProfile(retryData)) {
              await handleInactiveAccount();
              return;
            }

            if (retryData) {
              setInactiveError('');
              setProfile(retryData);
            }
          }
        }
      } else {
        if (isInactiveProfile(data)) {
          await handleInactiveAccount();
          return;
        }

        setInactiveError('');
        setProfile(data);
      }
    } catch (err) {
      console.error('fetchProfile error:', err);
    } finally {
      setLoading(false);
    }
  }

  // Call this after any profile update to sync context with DB
  async function refreshProfile() {
    if (session?.user) {
      await fetchProfile(session.user.id);
    }
  }

  async function signUp({
    email,
    password,
    firstName,
    lastName,
    phone,
    emailRedirectTo,
  }) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanMobile = cleanPhone(phone);

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        emailRedirectTo,
        data: {
          first_name: String(firstName || '').trim(),
          last_name: String(lastName || '').trim(),
          phone: cleanMobile,
          role: 'customer',
        },
      },
    });

    if (error) throw error;

    await supabase.auth.signOut();

    return data;
  }

  async function signIn({ email, password }) {
    setInactiveError('');

    const cleanEmail = String(email || '').trim().toLowerCase();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error) throw error;

    const userId = data?.user?.id;

    if (userId) {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError) {
        console.error('Profile check after login failed:', profileError.message);
      }

      if (isInactiveProfile(profileData)) {
        await handleInactiveAccount();

        throw new Error(
          'Your account has been deactivated. Please contact MotoFix support or the shop administrator.'
        );
      }

      if (profileData) {
        setProfile(profileData);
      }
    }

    return data;
  }

  async function signOut() {
    setInactiveError('');

    const { error } = await supabase.auth.signOut();

    if (error) throw error;

    setSession(null);
    setProfile(null);
  }

  const value = {
    session,
    user: session?.user || null,
    profile,
    loading,
    inactiveError,
    signUp,
    signIn,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
