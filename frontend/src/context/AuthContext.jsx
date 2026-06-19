import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get current session on load
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes (login, logout, token refresh)
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

    async function fetchProfile(userId) {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();

        if (error) {
          console.error('Error fetching profile:', error.message);
          // Profile might not exist yet — create it
          if (error.code === 'PGRST116') {
            const { data: userData } = await supabase.auth.getUser();
            if (userData?.user) {
              await supabase.from('profiles').insert({
                id: userId,
                first_name: userData.user.user_metadata?.first_name || '',
                last_name: userData.user.user_metadata?.last_name || '',
                email: userData.user.email || '',
                phone: userData.user.user_metadata?.phone || '',
                role: 'customer',
              });
              // Retry fetch
              const { data: retryData } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();
              if (retryData) setProfile(retryData);
            }
          }
        } else {
          setProfile(data);
        }
      } catch (err) {
        console.error('fetchProfile error:', err);
      } finally {
        setLoading(false);
      }
    }

  async function signUp({ email, password, firstName, lastName, phone }) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { first_name: firstName, last_name: lastName, phone },
      },
    });
    if (error) throw error;

    // Create profile row (also do this via DB trigger for safety - see schema.sql)
    if (data.user) {
      await supabase.from('profiles').insert({
        id: data.user.id,
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        role: 'customer',
      });
    }

    return data;
  }

  async function signIn({ email, password }) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  const value = {
    session,
    user: session?.user || null,
    profile,
    loading,
    signUp,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
