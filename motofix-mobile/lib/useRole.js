// lib/useRole.js
import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export function useRole() {
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUserRole() {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) throw error;
        
        // Default to 'customer' if metadata or role is missing
        setRole(user?.user_metadata?.role || 'customer');
      } catch (err) {
        console.error('Error fetching role in useRole hook:', err.message);
        setRole('customer'); 
      } finally {
        setLoading(false);
      }
    }

    fetchUserRole();
  }, []);

  return { role, loading };
}