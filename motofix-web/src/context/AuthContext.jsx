import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const AuthContext = createContext(null);

function cleanPhone(value = '') {
  return String(value || '').replace(/\D/g, '');
}

function normalizeRole(role) {
  return String(role || 'customer').toLowerCase().trim();
}

function normalizeProfile(profile) {
  if (!profile) return null;

  return {
    ...profile,
    role: normalizeRole(profile.role),
  };
}

function isInactiveProfile(profile) {
  return profile?.is_active === false;
}

export function AuthProvider({ children }) {
  const mountedRef = useRef(false);

  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [inactiveError, setInactiveError] = useState('');

  useEffect(() => {
    mountedRef.current = true;

    async function initializeSession() {
      setLoading(true);

      try {
        const {
          data: { session: currentSession },
          error,
        } = await supabase.auth.getSession();

        if (error) throw error;
        if (!mountedRef.current) return;

        setSession(currentSession || null);

        if (currentSession?.user?.id) {
          await fetchProfile(currentSession.user.id);
        } else {
          setProfile(null);
          setLoading(false);
        }
      } catch (error) {
        console.error('Auth initialization error:', error);

        if (mountedRef.current) {
          setSession(null);
          setProfile(null);
          setLoading(false);
        }
      }
    }

    initializeSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, currentSession) => {
      if (!mountedRef.current) return;

      setSession(currentSession || null);

      if (currentSession?.user?.id) {
        await fetchProfile(currentSession.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      mountedRef.current = false;
      subscription?.unsubscribe();
    };
  }, []);

  async function handleInactiveAccount() {
    if (mountedRef.current) {
      setInactiveError(
        'Your account has been deactivated. Please contact MotoFix support or the shop administrator.'
      );
      setProfile(null);
      setSession(null);
      setLoading(false);
    }

    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error('Inactive account sign out failed:', error.message);
    }
  }

  async function createMissingCustomerProfile(userId) {
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError) throw userError;

    const authUser = userData?.user;

    if (!authUser) {
      throw new Error('No authenticated user was found while creating profile.');
    }

    const metadata = authUser.user_metadata || {};

    const newProfile = {
      id: userId,
      first_name: String(metadata.first_name || '').trim(),
      last_name: String(metadata.last_name || '').trim(),
      email: authUser.email || '',
      phone: cleanPhone(metadata.phone || ''),
      role: 'customer',
      is_active: true,
    };

    const { data, error } = await supabase
      .from('profiles')
      .insert(newProfile)
      .select('*')
      .single();

    if (error) throw error;

    return normalizeProfile(data);
  }

  async function fetchProfile(userId) {
    if (!userId) {
      if (mountedRef.current) {
        setProfile(null);
        setLoading(false);
      }
      return null;
    }

    if (mountedRef.current) {
      setLoading(true);
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      let profileData = data ? normalizeProfile(data) : null;

      if (error) {
        if (error.code === 'PGRST116') {
          profileData = await createMissingCustomerProfile(userId);
        } else {
          throw error;
        }
      }

      if (isInactiveProfile(profileData)) {
        await handleInactiveAccount();
        return null;
      }

      if (mountedRef.current) {
        setInactiveError('');
        setProfile(profileData);
      }

      return profileData;
    } catch (error) {
      console.error('fetchProfile error:', error);

      if (mountedRef.current) {
        setProfile(null);
      }

      return null;
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }

  // Call this after any profile update to sync context with DB.
  async function refreshProfile() {
    const userId = session?.user?.id;

    if (!userId) {
      setProfile(null);
      return null;
    }

    return fetchProfile(userId);
  }

  async function signUp({
    email,
    password,
    firstName,
    lastName,
    phone,
    emailRedirectTo,
  }) {
    setInactiveError('');

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

    if (mountedRef.current) {
      setSession(null);
      setProfile(null);
      setLoading(false);
    }

    return data;
  }

  async function signIn({ email, password }) {
    setInactiveError('');

    const cleanEmail = String(email || '').trim().toLowerCase();

    if (mountedRef.current) {
      setLoading(true);
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) throw error;

      const currentSession = data?.session || null;
      const userId = data?.user?.id;

      if (mountedRef.current) {
        setSession(currentSession);
      }

      if (userId) {
        const profileData = await fetchProfile(userId);

        if (isInactiveProfile(profileData)) {
          await handleInactiveAccount();

          throw new Error(
            'Your account has been deactivated. Please contact MotoFix support or the shop administrator.'
          );
        }
      } else if (mountedRef.current) {
        setProfile(null);
      }

      return data;
    } catch (error) {
      if (mountedRef.current) {
        setLoading(false);
      }

      throw error;
    }
  }

  async function signOut() {
    setInactiveError('');

    if (mountedRef.current) {
      setLoading(true);
    }

    const { error } = await supabase.auth.signOut();

    if (error) {
      if (mountedRef.current) {
        setLoading(false);
      }

      throw error;
    }

    if (mountedRef.current) {
      setSession(null);
      setProfile(null);
      setLoading(false);
    }
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
    fetchProfile,
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
