// screens/customer/ProfileScreen.js
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../../lib/ThemeContext';
import { useRole } from '../../lib/useRole'; // Import your role checking hook
import { supabase } from '../../lib/supabase';

export default function ProfileScreen({ navigation }) {
  const { theme } = useTheme();
  const { role, loading } = useRole();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigation.replace('Login');
  };

  if (loading) return <View style={{ flex: 1, backgroundColor: theme.bg }} />;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* Global Card Content (Every role sees this) */}
      <View style={[styles.profileCard, { backgroundColor: theme.card }]}>
        <Text style={[styles.name, { color: theme.text }]}>Account Management</Text>
        <Text style={[styles.roleTag, { color: theme.primaryLight }]}>
          Role: {role ? role.toUpperCase() : 'CUSTOMER'}
        </Text>
      </View>

      {/* Role-Specific Control Options */}
      {role === 'admin' && (
        <TouchableOpacity style={[styles.optionBtn, { backgroundColor: theme.card }]}>
          <Text style={{ color: theme.text }}>⚙️ Global System Configuration</Text>
        </TouchableOpacity>
      )}

      {role === 'mechanic' && (
        <TouchableOpacity style={[styles.optionBtn, { backgroundColor: theme.card }]}>
          <Text style={{ color: theme.text }}>🔧 View Performance & Diagnostics Metrics</Text>
        </TouchableOpacity>
      )}

      {role === 'staff' && (
        <TouchableOpacity style={[styles.optionBtn, { backgroundColor: theme.card }]}>
          <Text style={{ color: theme.text }}>📦 Mark Inventory Override Tickets</Text>
        </TouchableOpacity>
      )}

      {/* Global Logout Button */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  profileCard: { padding: 20, borderRadius: 12, alignItems: 'center', marginBottom: 20 },
  name: { fontSize: 20, fontWeight: 'bold' },
  roleTag: { fontSize: 14, fontWeight: '600', marginTop: 4 },
  optionBtn: { padding: 16, borderRadius: 8, marginBottom: 12 },
  logoutBtn: { backgroundColor: '#DC2626', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 'auto' },
  logoutText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 }
});