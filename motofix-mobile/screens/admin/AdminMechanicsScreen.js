import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, StatusBar, RefreshControl, TextInput,
  Modal, Alert, Platform,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';

export default function AdminMechanicsScreen() {
  const { theme, isDark } = useTheme();
  const [mechanics, setMechanics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  // Certificates state
  const [certificates, setCertificates] = useState({}); // mechanicId -> []
  const [loadingCerts, setLoadingCerts] = useState(null); // mechanicId currently loading
  const [certName, setCertName] = useState('');
  const [certFile, setCertFile] = useState(null); // { uri, name, mimeType }
  const [uploadingCert, setUploadingCert] = useState(false);
  const [deletingCertId, setDeletingCertId] = useState(null);

  // Admin user id
  const [adminId, setAdminId] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAdminId(data?.user?.id || null));
    fetchMechanics();
  }, []);

  async function fetchMechanics() {
    const { data } = await supabase
      .from('profiles')
      .select('*, bookings!bookings_mechanic_id_fkey(id, status)')
      .eq('role', 'mechanic')
      .order('first_name', { ascending: true });
    if (data) setMechanics(data);
    setLoading(false);
    setRefreshing(false);
  }

  async function fetchCertificates(mechanicId) {
    setLoadingCerts(mechanicId);
    const { data } = await supabase
      .from('mechanic_certificates')
      .select('*')
      .eq('mechanic_id', mechanicId)
      .order('created_at', { ascending: false });
    setCertificates((prev) => ({ ...prev, [mechanicId]: data || [] }));
    setLoadingCerts(null);
  }

  function toggleExpand(mechanicId) {
    if (expandedId === mechanicId) {
      setExpandedId(null);
      setCertName('');
      setCertFile(null);
    } else {
      setExpandedId(mechanicId);
      setCertName('');
      setCertFile(null);
      fetchCertificates(mechanicId);
    }
  }

  async function pickDocument() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        setCertFile({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType });
        if (!certName) {
          // Pre-fill name from filename without extension
          const base = asset.name.replace(/\.[^/.]+$/, '');
          setCertName(base);
        }
      }
    } catch (err) {
      Alert.alert('Error', 'Could not pick document: ' + err.message);
    }
  }

  async function handleUpload(mechanicId) {
    if (!certName.trim()) {
      Alert.alert('Error', 'Please enter a certificate name.');
      return;
    }
    if (!certFile) {
      Alert.alert('Error', 'Please pick a file to upload.');
      return;
    }

    setUploadingCert(true);
    try {
      const ext = certFile.name.split('.').pop() || 'pdf';
      const filePath = `${mechanicId}/${Date.now()}.${ext}`;

      // Read file as blob
      const response = await fetch(certFile.uri);
      const blob = await response.blob();

      const { error: uploadError } = await supabase.storage
        .from('mechanic-certificates')
        .upload(filePath, blob, { contentType: certFile.mimeType || 'application/octet-stream' });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('mechanic-certificates')
        .getPublicUrl(filePath);

      const { error: insertError } = await supabase
        .from('mechanic_certificates')
        .insert({
          mechanic_id: mechanicId,
          name: certName.trim(),
          file_url: urlData.publicUrl,
          uploaded_by: adminId,
        });
      if (insertError) throw insertError;

      await supabase.from('audit_logs').insert({
        action: 'UPLOAD_MECHANIC_CERTIFICATE',
        entity: 'mechanic_certificates',
        entity_id: mechanicId,
        performed_by: adminId,
        details: { name: certName.trim() },
      });

      setCertName('');
      setCertFile(null);
      fetchCertificates(mechanicId);
    } catch (err) {
      Alert.alert('Upload failed', err.message);
    } finally {
      setUploadingCert(false);
    }
  }

  function confirmDelete(cert, mechanicId) {
    Alert.alert(
      'Delete Certificate',
      `Delete "${cert.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteCertificate(cert, mechanicId) },
      ]
    );
  }

  async function deleteCertificate(cert, mechanicId) {
    setDeletingCertId(cert.id);
    try {
      await supabase.from('mechanic_certificates').delete().eq('id', cert.id);
      await supabase.from('audit_logs').insert({
        action: 'DELETE_MECHANIC_CERTIFICATE',
        entity: 'mechanic_certificates',
        entity_id: cert.id,
        performed_by: adminId,
        details: { name: cert.name, mechanic_id: mechanicId },
      });
      fetchCertificates(mechanicId);
    } finally {
      setDeletingCertId(null);
    }
  }

  const filtered = mechanics.filter((m) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      `${m.first_name} ${m.last_name}`.toLowerCase().includes(q) ||
      (m.email || '').toLowerCase().includes(q) ||
      (m.specialization || '').toLowerCase().includes(q)
    );
  });

  const s = styles(theme);

  if (loading) return (
    <View style={s.centered}>
      <ActivityIndicator size="large" color={theme.primaryLight} />
    </View>
  );

  return (
    <View style={s.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.bg} />

      {/* Search */}
      <View style={s.searchWrap}>
        <TextInput
          style={s.searchInput}
          placeholder="Search mechanics..."
          placeholderTextColor={theme.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} style={s.searchClear}>
            <Text style={{ color: theme.textMuted }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchMechanics(); }} tintColor={theme.primaryLight} />}
      >
        <Text style={s.pageTitle}>Mechanics ({filtered.length})</Text>

        {filtered.length === 0 ? (
          <View style={s.emptyCard}>
            <Text style={s.emptyIcon}>🔧</Text>
            <Text style={s.emptyTitle}>No mechanics found</Text>
          </View>
        ) : (
          filtered.map((m) => {
            const isExpanded = expandedId === m.id;
            const total = m.bookings?.length || 0;
            const completed = m.bookings?.filter(b => b.status === 'completed').length || 0;
            const active = m.bookings?.filter(b => ['pending', 'confirmed', 'in_progress'].includes(b.status)).length || 0;
            const certs = certificates[m.id] || [];

            return (
              <View key={m.id} style={s.card}>
                {/* Mechanic row */}
                <View style={s.cardHeader}>
                  <View style={s.avatarWrap}>
                    <Text style={s.avatarText}>
                      {(m.first_name?.[0] || '') + (m.last_name?.[0] || '')}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.mechanicName}>{m.first_name} {m.last_name}</Text>
                    {m.specialization ? (
                      <Text style={s.mechanicSpec}>{m.specialization}</Text>
                    ) : null}
                    <Text style={s.mechanicEmail}>{m.email}</Text>
                    <View style={s.statsRow}>
                      <Text style={s.statText}>Total: {total}</Text>
                      <Text style={[s.statText, { color: '#3b82f6' }]}>Active: {active}</Text>
                      <Text style={[s.statText, { color: theme.success }]}>Done: {completed}</Text>
                      {m.rating_avg > 0 && (
                        <Text style={[s.statText, { color: '#eab308' }]}>★ {Number(m.rating_avg).toFixed(1)}</Text>
                      )}
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[s.expandBtn, isExpanded && s.expandBtnActive]}
                    onPress={() => toggleExpand(m.id)}
                  >
                    <Text style={[s.expandBtnText, isExpanded && s.expandBtnTextActive]}>
                      {isExpanded ? 'Close' : '🎓 Certs'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Certificates panel */}
                {isExpanded && (
                  <View style={s.certsPanel}>
                    <Text style={s.certsPanelTitle}>🎓 Certificates</Text>

                    {loadingCerts === m.id ? (
                      <ActivityIndicator size="small" color={theme.primaryLight} style={{ marginVertical: 12 }} />
                    ) : certs.length === 0 ? (
                      <Text style={s.emptyText}>No certificates uploaded yet.</Text>
                    ) : (
                      certs.map((c) => (
                        <View key={c.id} style={s.certRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={s.certName} numberOfLines={1}>{c.name}</Text>
                            <Text style={s.certDate}>
                              Uploaded {new Date(c.created_at).toLocaleDateString()}
                            </Text>
                          </View>
                          <View style={s.certActions}>
                            <TouchableOpacity
                              style={s.viewBtn}
                              onPress={() => {
                                // Open in browser
                                const { Linking } = require('react-native');
                                Linking.openURL(c.file_url);
                              }}
                            >
                              <Text style={s.viewBtnText}>View</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={s.deleteBtn}
                              disabled={deletingCertId === c.id}
                              onPress={() => confirmDelete(c, m.id)}
                            >
                              <Text style={s.deleteBtnText}>
                                {deletingCertId === c.id ? '...' : 'Delete'}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))
                    )}

                    {/* Upload form */}
                    <View style={s.uploadForm}>
                      <Text style={s.uploadFormTitle}>+ Upload Certificate</Text>
                      <TextInput
                        style={s.input}
                        placeholder="Certificate name (e.g. TESDA NC II)"
                        placeholderTextColor={theme.textMuted}
                        value={certName}
                        onChangeText={setCertName}
                      />
                      <TouchableOpacity style={s.filePickerBtn} onPress={pickDocument}>
                        <Text style={s.filePickerBtnText}>
                          {certFile ? `📄 ${certFile.name}` : '📁 Pick file (image or PDF)'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.uploadBtn, uploadingCert && s.uploadBtnDisabled]}
                        onPress={() => handleUpload(m.id)}
                        disabled={uploadingCert}
                      >
                        {uploadingCert ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={s.uploadBtnText}>Upload</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            );
          })
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', margin: 12,
    backgroundColor: theme.bg2, borderRadius: 10, borderWidth: 1,
    borderColor: theme.border, paddingHorizontal: 12,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: theme.text },
  searchClear: { padding: 4 },
  pageTitle: { fontSize: 18, fontWeight: 'bold', color: theme.text, paddingHorizontal: 16, marginBottom: 12 },
  emptyCard: { alignItems: 'center', padding: 48 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: 'bold', color: theme.text },
  card: {
    backgroundColor: theme.card, marginHorizontal: 12, marginBottom: 12,
    borderRadius: 14, borderWidth: 1, borderColor: theme.border, overflow: 'hidden',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  avatarWrap: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: theme.primary,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  avatarText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  mechanicName: { fontSize: 15, fontWeight: 'bold', color: theme.text },
  mechanicSpec: { fontSize: 12, color: theme.primaryLight, marginTop: 1 },
  mechanicEmail: { fontSize: 12, color: theme.textSub, marginTop: 1 },
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  statText: { fontSize: 11, color: theme.textMuted },
  expandBtn: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
    backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border,
  },
  expandBtnActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  expandBtnText: { fontSize: 12, color: theme.text, fontWeight: '600' },
  expandBtnTextActive: { color: '#fff' },

  // Certs panel
  certsPanel: {
    borderTopWidth: 1, borderTopColor: theme.border,
    padding: 14, backgroundColor: theme.bg2,
  },
  certsPanelTitle: { fontSize: 14, fontWeight: 'bold', color: theme.text, marginBottom: 10 },
  emptyText: { fontSize: 13, color: theme.textMuted, marginBottom: 12 },
  certRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: theme.card,
    borderRadius: 10, padding: 10, marginBottom: 8,
    borderWidth: 1, borderColor: theme.border,
  },
  certName: { fontSize: 13, fontWeight: '600', color: theme.text },
  certDate: { fontSize: 11, color: theme.textMuted, marginTop: 2 },
  certActions: { flexDirection: 'row', gap: 6 },
  viewBtn: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    backgroundColor: theme.primary + '18', borderWidth: 1, borderColor: theme.primary + '44',
  },
  viewBtnText: { fontSize: 12, color: theme.primaryLight, fontWeight: '600' },
  deleteBtn: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    backgroundColor: '#ef444418', borderWidth: 1, borderColor: '#ef444444',
  },
  deleteBtnText: { fontSize: 12, color: '#ef4444', fontWeight: '600' },

  // Upload form
  uploadForm: {
    marginTop: 12, backgroundColor: theme.card, borderRadius: 12,
    padding: 14, borderWidth: 1, borderColor: theme.border,
  },
  uploadFormTitle: { fontSize: 13, fontWeight: 'bold', color: theme.text, marginBottom: 10 },
  input: {
    borderWidth: 1, borderColor: theme.border, borderRadius: 10,
    padding: 10, fontSize: 13, color: theme.text,
    backgroundColor: theme.bg2, marginBottom: 10,
  },
  filePickerBtn: {
    borderWidth: 1, borderColor: theme.border, borderRadius: 10,
    padding: 10, marginBottom: 10, backgroundColor: theme.bg2,
    alignItems: 'center',
  },
  filePickerBtnText: { fontSize: 13, color: theme.textSub },
  uploadBtn: {
    backgroundColor: theme.primary, borderRadius: 10,
    padding: 12, alignItems: 'center',
  },
  uploadBtnDisabled: { opacity: 0.5 },
  uploadBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
});