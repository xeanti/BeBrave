// screens/customer/ProfileScreen.js
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../lib/ThemeContext';
import { supabase } from '../../lib/supabase';

export default function ProfileScreen({ navigation }) {
  const { theme, isDark, toggleTheme } = useTheme();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [certificates, setCertificates] = useState([]);
  const [loadingCerts, setLoadingCerts] = useState(false);
  
  useEffect(() => { fetchProfile(); }, []);

  async function fetchProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (!error) {
      setProfile(data);
      if (data?.role === 'mechanic') {
        fetchCertificates(user.id);
      }
    }
    setLoading(false);
  }

  async function fetchCertificates(mechanicId) {
    setLoadingCerts(true);
    const { data } = await supabase
      .from('mechanic_certificates')
      .select('*')
      .eq('mechanic_id', mechanicId)
      .order('created_at', { ascending: false });
    if (data) setCertificates(data);
    setLoadingCerts(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    navigation.replace('Login');
  }

  const s = styles(theme);

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={theme.primaryLight} />
      </View>
    );
  }

  const initials = profile
    ? `${profile.first_name?.[0] || ''}${profile.last_name?.[0] || ''}`.toUpperCase()
    : '?';

  const role = profile?.role || 'customer';

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      {/* Header card */}
      <View style={s.headerCard}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{initials}</Text>
        </View>
        <Text style={s.name}>{profile?.first_name} {profile?.last_name}</Text>
        <Text style={s.email}>{profile?.email}</Text>
        <View style={s.roleBadge}>
          <Text style={s.roleBadgeText}>{role}</Text>
        </View>
      </View>

      {/* Account info */}
      <Text style={s.sectionLabel}>Account Information</Text>
      <View style={s.card}>
        <InfoRow theme={theme} icon="call-outline" label="Phone" value={profile?.phone || 'Not set'} />
        {role !== 'mechanic' && profile?.moto_make && (
          <InfoRow
            theme={theme}
            icon="bicycle-outline"
            label="Motorcycle"
            value={`${profile.moto_make} ${profile.moto_model || ''} ${profile.moto_year || ''}`.trim()}
          />
        )}
        {role === 'mechanic' && profile?.specialization && (
          <InfoRow theme={theme} icon="construct-outline" label="Specialization" value={profile.specialization} />
        )}
        {role === 'mechanic' && (
          <InfoRow
            theme={theme}
            icon="star-outline"
            label="Rating"
            value={profile?.rating_avg ? `★ ${Number(profile.rating_avg).toFixed(1)} (${profile.rating_count || 0})` : 'No ratings yet'}
          />
        )}
      </View>

      {/* Preferences */}
      <Text style={s.sectionLabel}>Preferences</Text>
      <View style={s.card}>
        <View style={s.toggleRow}>
          <View style={s.toggleLeft}>
            <Ionicons name={isDark ? 'moon' : 'sunny'} size={20} color={theme.primaryLight} style={{ marginRight: 12 }} />
            <View>
              <Text style={s.toggleLabel}>Dark Mode</Text>
              <Text style={s.toggleSub}>{isDark ? 'Currently dark' : 'Currently light'}</Text>
            </View>
          </View>
          <Switch
            value={isDark}
            onValueChange={toggleTheme}
            trackColor={{ false: theme.bg3, true: theme.primary }}
            thumbColor="#fff"
          />
        </View>
      </View>

      {/* Certificates — mechanic only */}
      {role === 'mechanic' && (
        <>
          <Text style={s.sectionLabel}>My Certificates</Text>
          <View style={s.card}>
            {loadingCerts ? (
              <View style={{ padding: 16, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={theme.primaryLight} />
              </View>
            ) : certificates.length === 0 ? (
              <View style={{ padding: 16 }}>
                <Text style={{ fontSize: 13, color: theme.textMuted }}>
                  No certificates on file yet.
                </Text>
                <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>
                  Ask your administrator to upload your certificates.
                </Text>
              </View>
            ) : (
              certificates.map((c, index) => (
                <View
                  key={c.id}
                  style={[
                    s.infoRow,
                    index < certificates.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border },
                  ]}
                >
                  <Text style={{ fontSize: 18, marginRight: 12 }}>📄</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.infoLabel]}>Certificate</Text>
                    <Text style={s.infoValue}>{c.name}</Text>
                    <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 1 }}>
                      Uploaded {new Date(c.created_at).toLocaleDateString()}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      const { Linking } = require('react-native');
                      Linking.openURL(c.file_url);
                    }}
                    style={{
                      paddingHorizontal: 12, paddingVertical: 6,
                      borderRadius: 8, borderWidth: 1,
                      borderColor: theme.primary + '44',
                      backgroundColor: theme.primary + '18',
                    }}
                  >
                    <Text style={{ fontSize: 12, color: theme.primaryLight, fontWeight: '600' }}>View</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        </>
      )}

      {/* Role-specific actions */}
      {(role === 'admin' || role === 'mechanic' || role === 'staff') && (
        <>
          <Text style={s.sectionLabel}>Tools</Text>
          <View style={s.card}>
            {role === 'admin' && (
              <ActionRow theme={theme} icon="settings-outline" label="Global System Configuration" />
            )}
            {role === 'mechanic' && (
              <ActionRow theme={theme} icon="speedometer-outline" label="View Performance & Diagnostics" />
            )}
            {role === 'staff' && (
              <ActionRow theme={theme} icon="cube-outline" label="Mark Inventory Override Tickets" />
            )}
          </View>
        </>
      )}

      {/* Logout */}
      <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
        <Text style={s.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function InfoRow({ theme, icon, label, value }) {
  const s = styles(theme);
  return (
    <View style={s.infoRow}>
      <Ionicons name={icon} size={18} color={theme.textMuted} style={{ marginRight: 12 }} />
      <View style={{ flex: 1 }}>
        <Text style={s.infoLabel}>{label}</Text>
        <Text style={s.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

function ActionRow({ theme, icon, label }) {
  const s = styles(theme);
  return (
    <TouchableOpacity style={s.actionRow}>
      <Ionicons name={icon} size={18} color={theme.primaryLight} style={{ marginRight: 12 }} />
      <Text style={s.actionLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={theme.textMuted} style={{ marginLeft: 'auto' }} />
    </TouchableOpacity>
  );
}

const styles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg },
  content: { padding: 20, paddingBottom: 40 },
  headerCard: { backgroundColor: theme.card, borderRadius: 16, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: theme.border, marginBottom: 24 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: theme.primary, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  avatarText: { color: '#fff', fontSize: 26, fontWeight: 'bold' },
  name: { fontSize: 19, fontWeight: 'bold', color: theme.text },
  email: { fontSize: 13, color: theme.textSub, marginTop: 2, marginBottom: 10 },
  roleBadge: { backgroundColor: theme.primary + '22', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  roleBadgeText: { color: theme.primaryLight, fontSize: 12, fontWeight: 'bold', textTransform: 'capitalize' },
  sectionLabel: { fontSize: 12, fontWeight: 'bold', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginLeft: 4 },
  card: { backgroundColor: theme.card, borderRadius: 14, borderWidth: 1, borderColor: theme.border, marginBottom: 20, overflow: 'hidden' },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: theme.border },
  infoLabel: { fontSize: 11, color: theme.textMuted, marginBottom: 2 },
  infoValue: { fontSize: 14, color: theme.text, fontWeight: '500' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  toggleLeft: { flexDirection: 'row', alignItems: 'center' },
  toggleLabel: { fontSize: 14, color: theme.text, fontWeight: '600' },
  toggleSub: { fontSize: 12, color: theme.textMuted, marginTop: 1 },
  actionRow: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  actionLabel: { fontSize: 14, color: theme.text, fontWeight: '500' },
  logoutBtn: { flexDirection: 'row', backgroundColor: '#DC2626', padding: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  logoutText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});