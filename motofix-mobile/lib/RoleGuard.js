import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { supabase } from './supabase';
import { useTheme } from './ThemeContext';

// Mirrors web's ProtectedRoute: verifies the logged-in user's role
// matches one of allowedRoles before rendering children. Role is read
// from the `profiles` table (same source web's AuthContext uses) —
// NOT from auth user_metadata, since mechanic/staff/admin accounts
// never get a role written there.
export default function RoleGuard({ allowedRoles, navigation, children }) {
  const { theme } = useTheme();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function checkRole() {
      const { data: { user }, error } = await supabase.auth.getUser();

      if (error || !user) {
        if (isMounted) navigation.replace('Login');
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profileError) {
        if (isMounted) navigation.replace('Login');
        return;
      }

      const role = profile?.role || 'customer';

      if (!allowedRoles.includes(role)) {
        const homeRoute =
          role === 'admin' ? 'AdminMain' :
          role === 'mechanic' ? 'MechanicMain' :
          role === 'staff' ? 'StaffMain' :
          'Main';
        if (isMounted) navigation.replace(homeRoute);
        return;
      }

      if (isMounted) {
        setAllowed(true);
        setChecking(false);
      }
    }

    checkRole();
    return () => { isMounted = false; };
  }, []);

  if (checking) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={theme.primaryLight} />
      </View>
    );
  }

  return allowed ? children : null;
}