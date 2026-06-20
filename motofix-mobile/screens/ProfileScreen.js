import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, ScrollView, Alert, ActivityIndicator, StatusBar } from 'react-native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/ThemeContext';

export default function ProfileScreen({ navigation }) {
  const { theme, isDark, toggleTheme } = useTheme();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchUser(); }, []);

  async function fetchUser() {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
    setLoading(false);
  }

  async function handleLogout() {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out', style: 'destructive', onPress: async () => {
          await supabase.auth.signOut();
          navigation.replace('Login');
        }
      }
    ]);
  }

  const s = styles(theme);

  if (loading) return (
    <View style={s.centered}>
      <ActivityIndicator size="large" color={theme.primaryLight} />
    </View>
  );

  return (
    <ScrollView style={s.container} showsVerticalScrollIndicator={false}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.bg} />

      {/* Avatar */}
      <View style={s.avatarSection}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>
            {(user?.user_metadata?.first_name?.[0] || 'U').toUpperCase()}
          </Text>
        </View>
        <Text style={s.name}>
          {user?.user_metadata?.first_name} {user?.user_metadata?.last_name}
        </Text>
        <Text style={s.email}>{user?.email}</Text>
      </View>

      {/* Settings */}
      <Text style={s.sectionTitle}>Settings</Text>

      <View style={s.card}>
        <View style={s.row}>
          <Text style={s.rowLabel}>🌙 Dark Mode</Text>
          <Switch
            value={isDark}
            onValueChange={toggleTheme}
            trackColor={{ false: theme.border, true: theme.primary }}
            thumbColor={isDark ? theme.primaryLight : '#f4f3f4'}
          />
        </View>
      </View>

      {/* Account Info */}
      <Text style={s.sectionTitle}>Account</Text>
      <View style={s.card}>
        <View style={s.row}>
          <Text style={s.rowLabel}>📧 Email</Text>
          <Text style={s.rowValue}>{user?.email}</Text>
        </View>
        <View style={s.divider} />
        <View style={s.row}>
          <Text style={s.rowLabel}>📱 Phone</Text>
          <Text style={s.rowValue}>{user?.user_metadata?.phone || '—'}</Text>
        </View>
      </View>

      {/* Logout */}
      <TouchableOpacity style={s.logoutButton} onPress={handleLogout}>
        <Text style={s.logoutText}>Log Out</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg },
  avatarSection: { alignItems: 'center', paddingTop: 48, paddingBottom: 24 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: theme.primary, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  avatarText: { color: '#fff', fontWeight: 'bold', fontSize: 32 },
  name: { fontSize: 22, fontWeight: 'bold', color: theme.text, marginBottom: 4 },
  email: { fontSize: 14, color: theme.textSub },
  sectionTitle: { fontSize: 13, fontWeight: 'bold', color: theme.textMuted, paddingHorizontal: 16, marginTop: 24, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  card: { backgroundColor: theme.card, marginHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 },
  rowLabel: { fontSize: 15, color: theme.text },
  rowValue: { fontSize: 14, color: theme.textSub, maxWidth: '60%', textAlign: 'right' },
  divider: { height: 1, backgroundColor: theme.border },
  logoutButton: { margin: 16, marginTop: 32, backgroundColor: theme.danger + '22', borderWidth: 1, borderColor: theme.danger, borderRadius: 12, padding: 16, alignItems: 'center' },
  logoutText: { color: theme.danger, fontWeight: 'bold', fontSize: 16 },
});