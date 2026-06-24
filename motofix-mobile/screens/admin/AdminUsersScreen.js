import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, StatusBar, RefreshControl,
  Modal, Alert, KeyboardAvoidingView, Platform, Linking, FlatList,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';

const ROLE_COLORS = {
  customer: '#3b82f6',
  mechanic: '#22c55e',
  staff: '#a855f7',
  admin: '#ef4444',
};

const EMPTY_NEW_ACCOUNT = {
  firstName: '', lastName: '', email: '', phone: '', password: '', confirmPassword: '', role: 'mechanic',
};

export default function AdminUsersScreen() {
  const { theme, isDark } = useTheme();
  const s = styles(theme);

  const [adminId, setAdminId] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  const [showPolicy, setShowPolicy] = useState(false);

  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [editSuccess, setEditSuccess] = useState('');

  // Password change
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [newAccount, setNewAccount] = useState(EMPTY_NEW_ACCOUNT);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');

  const [selectedMechanicId, setSelectedMechanicId] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [loadingSchedule, setLoadingSchedule] = useState(false);

  const [certificates, setCertificates] = useState({});
  const [certName, setCertName] = useState('');
  const [certFile, setCertFile] = useState(null);
  const [uploadingCert, setUploadingCert] = useState(false);
  const [certError, setCertError] = useState('');
  const [deletingCertId, setDeletingCertId] = useState(null);
  const [loadingCerts, setLoadingCerts] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAdminId(data?.user?.id || null));
    fetchUsers();
  }, []);

  async function fetchUsers() {
    const { data } = await supabase
      .from('profiles')
      .select('*, bookings!bookings_mechanic_id_fkey(id, status)')
      .order('created_at', { ascending: false });
    if (data) setUsers(data);
    setLoading(false);
    setRefreshing(false);
  }

  async function fetchMechanicSchedule(mechanicId) {
    setLoadingSchedule(true);
    const { data } = await supabase
      .from('bookings')
      .select('id, booking_date, booking_time, status, notes, profiles!bookings_customer_id_fkey(first_name, last_name), services(name)')
      .eq('mechanic_id', mechanicId)
      .order('booking_date', { ascending: true });
    if (data) setSchedules(data);
    setLoadingSchedule(false);
  }

  async function fetchCertificates(mechanicId) {
    setLoadingCerts(true);
    const { data } = await supabase
      .from('mechanic_certificates')
      .select('*')
      .eq('mechanic_id', mechanicId)
      .order('created_at', { ascending: false });
    if (data) setCertificates(prev => ({ ...prev, [mechanicId]: data }));
    setLoadingCerts(false);
  }

  function toggleMechanicExpand(userId) {
    if (selectedMechanicId === userId) {
      setSelectedMechanicId(null);
      setSchedules([]);
      setCertName('');
      setCertFile(null);
      setCertError('');
    } else {
      setSelectedMechanicId(userId);
      fetchMechanicSchedule(userId);
      fetchCertificates(userId);
      setCertName('');
      setCertFile(null);
      setCertError('');
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
        if (!certName) setCertName(asset.name.replace(/\.[^/.]+$/, ''));
      }
    } catch (err) {
      Alert.alert('Error', 'Could not pick document: ' + err.message);
    }
  }

  async function handleUploadCertificate(mechanicId) {
    setCertError('');
    if (!certName.trim()) { setCertError('Please enter a certificate name.'); return; }
    if (!certFile) { setCertError('Please pick a file to upload.'); return; }
    setUploadingCert(true);
    try {
      const ext = certFile.name.split('.').pop() || 'pdf';
      const filePath = `${mechanicId}/${Date.now()}.${ext}`;
      const response = await fetch(certFile.uri);
      const blob = await response.blob();
      const { error: uploadError } = await supabase.storage
        .from('mechanic-certificates')
        .upload(filePath, blob, { contentType: certFile.mimeType || 'application/octet-stream' });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('mechanic-certificates').getPublicUrl(filePath);
      const { error: insertError } = await supabase.from('mechanic_certificates').insert({
        mechanic_id: mechanicId, name: certName.trim(), file_url: urlData.publicUrl, uploaded_by: adminId,
      });
      if (insertError) throw insertError;
      await supabase.from('audit_logs').insert({
        action: 'UPLOAD_MECHANIC_CERTIFICATE', entity: 'mechanic_certificates',
        entity_id: mechanicId, performed_by: adminId, details: { name: certName.trim() },
      });
      setCertName(''); setCertFile(null);
      fetchCertificates(mechanicId);
    } catch (err) {
      setCertError(err.message);
    } finally {
      setUploadingCert(false);
    }
  }

  function confirmDeleteCert(cert, mechanicId) {
    Alert.alert('Delete Certificate', `Delete "${cert.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteCertificate(cert, mechanicId) },
    ]);
  }

  async function deleteCertificate(cert, mechanicId) {
    setDeletingCertId(cert.id);
    try {
      await supabase.from('mechanic_certificates').delete().eq('id', cert.id);
      await supabase.from('audit_logs').insert({
        action: 'DELETE_MECHANIC_CERTIFICATE', entity: 'mechanic_certificates',
        entity_id: cert.id, performed_by: adminId,
        details: { name: cert.name, mechanic_id: mechanicId },
      });
      fetchCertificates(mechanicId);
    } finally {
      setDeletingCertId(null);
    }
  }

  function openEdit(u) {
    setEditingUser(u);
    setEditForm({
      first_name: u.first_name || '',
      last_name: u.last_name || '',
      phone: u.phone || '',
      role: u.role || 'customer',
      specialization: u.specialization || '',
      moto_make: u.moto_make || '',
      moto_model: u.moto_model || '',
      moto_year: u.moto_year ? String(u.moto_year) : '',
    });
    setEditError(''); setEditSuccess('');
    setNewPassword(''); setConfirmNewPassword('');
    setPasswordError(''); setPasswordSuccess('');
  }

  function closeEdit() {
    setEditingUser(null); setEditForm({});
    setEditError(''); setEditSuccess('');
    setNewPassword(''); setConfirmNewPassword('');
    setPasswordError(''); setPasswordSuccess('');
  }

  async function handleSaveEdit() {
    setSaving(true); setEditError(''); setEditSuccess('');
    const payload = {
      first_name: editForm.first_name,
      last_name: editForm.last_name,
      phone: editForm.phone || null,
      role: editForm.role,
      specialization: editForm.role === 'mechanic' ? (editForm.specialization || null) : null,
      moto_make: editForm.role === 'customer' ? (editForm.moto_make || null) : null,
      moto_model: editForm.role === 'customer' ? (editForm.moto_model || null) : null,
      moto_year: (editForm.role === 'customer' && editForm.moto_year) ? parseInt(editForm.moto_year) : null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('profiles').update(payload).eq('id', editingUser.id);
    if (error) {
      setEditError(error.message);
    } else {
      await supabase.from('audit_logs').insert({
        action: 'UPDATE_USER_PROFILE', entity: 'profiles', entity_id: editingUser.id,
        performed_by: adminId, details: { role: payload.role, name: `${payload.first_name} ${payload.last_name}` },
      });
      setEditSuccess('Profile updated successfully!');
      fetchUsers();
    }
    setSaving(false);
  }

  // ── Password change via Edge Function ────────────────────────────────────────
  async function handleChangePassword() {
    setPasswordError(''); setPasswordSuccess('');
    if (!newPassword) { setPasswordError('Please enter a new password.'); return; }
    if (newPassword.length < 6) { setPasswordError('Password must be at least 6 characters.'); return; }
    if (newPassword !== confirmNewPassword) { setPasswordError('Passwords do not match.'); return; }

    setChangingPassword(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-change-password', {
        body: { userId: editingUser.id, newPassword },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      await supabase.from('audit_logs').insert({
        action: 'ADMIN_CHANGE_PASSWORD', entity: 'profiles', entity_id: editingUser.id,
        performed_by: adminId, details: { email: editingUser.email },
      });
      setPasswordSuccess('Password changed successfully!');
      setNewPassword(''); setConfirmNewPassword('');
    } catch (err) {
      setPasswordError(err.message);
    } finally {
      setChangingPassword(false);
    }
  }

  async function handleDemote(userId, currentRole) {
    Alert.alert('Demote User', `Remove ${currentRole} access and set to customer?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Demote', style: 'destructive', onPress: async () => {
          await supabase.from('profiles').update({ role: 'customer' }).eq('id', userId);
          await supabase.from('audit_logs').insert({
            action: 'DEMOTE_USER', entity: 'profiles', entity_id: userId,
            performed_by: adminId, details: { from_role: currentRole, to_role: 'customer' },
          });
          fetchUsers();
          if (editingUser?.id === userId) {
            setEditForm(f => ({ ...f, role: 'customer' }));
            setEditingUser(prev => ({ ...prev, role: 'customer' }));
          }
        }
      },
    ]);
  }

  async function handleCreateAccount() {
    setCreateError(''); setCreateSuccess('');
    if (newAccount.password !== newAccount.confirmPassword) { setCreateError('Passwords do not match.'); return; }
    if (newAccount.password.length < 6) { setCreateError('Password must be at least 6 characters.'); return; }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-account', {
        body: {
          firstName: newAccount.firstName, lastName: newAccount.lastName,
          email: newAccount.email, phone: newAccount.phone,
          password: newAccount.password, role: newAccount.role,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      await supabase.from('audit_logs').insert({
        action: 'CREATE_USER_ACCOUNT', entity: 'profiles', entity_id: data.account?.id,
        performed_by: adminId, details: { role: newAccount.role, email: newAccount.email },
      });
      setCreateSuccess(`✅ ${newAccount.role} account created for ${newAccount.firstName} ${newAccount.lastName}!`);
      setNewAccount(EMPTY_NEW_ACCOUNT);
      fetchUsers();
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  }

  const counts = {
    all: users.length,
    customer: users.filter(u => u.role === 'customer').length,
    mechanic: users.filter(u => u.role === 'mechanic').length,
    staff: users.filter(u => u.role === 'staff').length,
    admin: users.filter(u => u.role === 'admin').length,
  };

  const filtered = users.filter(u => {
    const matchRole = roleFilter === 'all' || u.role === roleFilter;
    const q = search.trim().toLowerCase();
    const matchSearch = !q ||
      `${u.first_name} ${u.last_name}`.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.phone || '').includes(q);
    return matchRole && matchSearch;
  });

  const renderUser = ({ item: u }) => {
    const mechanicBookings = u.bookings || [];
    const total = mechanicBookings.length;
    const completed = mechanicBookings.filter(b => b.status === 'completed').length;
    const active = mechanicBookings.filter(b => ['pending', 'confirmed', 'in_progress'].includes(b.status)).length;
    const isExpanded = selectedMechanicId === u.id;
    const isSelf = u.id === adminId;

    return (
      <View style={s.card}>
        <View style={s.cardHeader}>
          <View style={s.avatarWrap}>
            <Text style={s.avatarText}>
              {(u.first_name?.[0] || '') + (u.last_name?.[0] || '')}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={s.nameRow}>
              <Text style={s.userName}>{u.first_name} {u.last_name}</Text>
              {isSelf && <Text style={s.selfLabel}>(you)</Text>}
              <View style={[s.roleBadge, { backgroundColor: ROLE_COLORS[u.role] + '22' }]}>
                <Text style={[s.roleBadgeText, { color: ROLE_COLORS[u.role] }]}>{u.role}</Text>
              </View>
            </View>
            <Text style={s.userEmail}>{u.email}</Text>
            {u.phone ? <Text style={s.userPhone}>{u.phone}</Text> : null}
            {u.role === 'mechanic' && (
              <View style={s.statsRow}>
                {u.specialization ? <Text style={s.specText}>{u.specialization}</Text> : null}
                <Text style={s.statText}>Total: {total} · Active: {active} · Done: {completed}</Text>
                {u.rating_avg > 0 && <Text style={s.ratingText}>★ {Number(u.rating_avg).toFixed(1)} ({u.rating_count})</Text>}
              </View>
            )}
            {u.role === 'customer' && u.moto_make && (
              <Text style={s.motoText}>🏍️ {u.moto_make} {u.moto_model} {u.moto_year ? `(${u.moto_year})` : ''}</Text>
            )}
          </View>
        </View>

        <View style={s.actionsRow}>
          <TouchableOpacity style={s.editBtn} onPress={() => openEdit(u)}>
            <Text style={s.editBtnText}>✎ Edit</Text>
          </TouchableOpacity>
          {/* Demote: mechanic, staff, and other admins (not self) */}
          {(u.role === 'mechanic' || u.role === 'staff' || (u.role === 'admin' && !isSelf)) && (
            <TouchableOpacity style={s.demoteBtn} onPress={() => handleDemote(u.id, u.role)}>
              <Text style={s.demoteBtnText}>Demote</Text>
            </TouchableOpacity>
          )}
          {u.role === 'mechanic' && (
            <TouchableOpacity
              style={[s.scheduleBtn, isExpanded && s.scheduleBtnActive]}
              onPress={() => toggleMechanicExpand(u.id)}
            >
              <Text style={[s.scheduleBtnText, isExpanded && s.scheduleBtnTextActive]}>
                {isExpanded ? 'Close' : '📅 Schedule & Certs'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {isExpanded && (
          <View style={s.expandedPanel}>
            <Text style={s.panelTitle}>📅 Schedule</Text>
            {loadingSchedule ? (
              <ActivityIndicator size="small" color={theme.primaryLight} />
            ) : schedules.length === 0 ? (
              <Text style={s.emptyText}>No bookings assigned yet.</Text>
            ) : (
              schedules.map(b => (
                <View key={b.id} style={s.scheduleCard}>
                  <Text style={s.scheduleCustomer}>{b.profiles?.first_name} {b.profiles?.last_name}</Text>
                  <Text style={s.scheduleSub}>{b.services?.name}</Text>
                  <Text style={s.scheduleSub}>{b.booking_date} at {b.booking_time}</Text>
                  <View style={[s.statusBadge, { backgroundColor: '#eab30822' }]}>
                    <Text style={[s.statusBadgeText, { color: '#eab308' }]}>{b.status}</Text>
                  </View>
                </View>
              ))
            )}

            <Text style={[s.panelTitle, { marginTop: 16 }]}>🎓 Certificates</Text>
            {loadingCerts ? (
              <ActivityIndicator size="small" color={theme.primaryLight} />
            ) : (certificates[u.id] || []).length === 0 ? (
              <Text style={s.emptyText}>No certificates uploaded yet.</Text>
            ) : (
              (certificates[u.id] || []).map(c => (
                <View key={c.id} style={s.certRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.certName} numberOfLines={1}>📄 {c.name}</Text>
                    <Text style={s.certDate}>Uploaded {new Date(c.created_at).toLocaleDateString()}</Text>
                  </View>
                  <View style={s.certActions}>
                    <TouchableOpacity style={s.viewBtn} onPress={() => Linking.openURL(c.file_url)}>
                      <Text style={s.viewBtnText}>View</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={s.deleteBtn}
                      disabled={deletingCertId === c.id}
                      onPress={() => confirmDeleteCert(c, u.id)}
                    >
                      <Text style={s.deleteBtnText}>{deletingCertId === c.id ? '...' : 'Delete'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}

            {certError ? <Text style={s.certError}>{certError}</Text> : null}
            <View style={s.uploadForm}>
              <Text style={s.uploadFormTitle}>+ Upload Certificate</Text>
              <TextInput
                style={s.input}
                placeholder="Certificate name"
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
                style={[s.uploadBtn, uploadingCert && { opacity: 0.5 }]}
                onPress={() => handleUploadCertificate(u.id)}
                disabled={uploadingCert}
              >
                {uploadingCert
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={s.uploadBtnText}>Upload</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  if (loading) return (
    <View style={s.centered}>
      <ActivityIndicator size="large" color={theme.primaryLight} />
    </View>
  );

  return (
    <View style={s.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.bg} />

      <View style={s.searchWrap}>
        <TextInput
          style={s.searchInput}
          placeholder="Search by name, email, or phone..."
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

      <View style={s.filterBarWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterContent}>
          {['all', 'customer', 'mechanic', 'staff', 'admin'].map(r => (
            <TouchableOpacity
              key={r}
              style={[s.filterChip, roleFilter === r && s.filterChipActive]}
              onPress={() => setRoleFilter(r)}
            >
              <Text style={[s.filterText, roleFilter === r && s.filterTextActive]}>
                {r} ({counts[r]})
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={s.createBtnRow}>
        <TouchableOpacity
          style={[s.createBtn, { backgroundColor: '#854d0e', flex: 1 }]}
          onPress={() => setShowPolicy(true)}
        >
          <Text style={s.createBtnText}>⚠️ Access Policy</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.createBtn, { flex: 1 }]}
          onPress={() => { setShowCreate(true); setCreateError(''); setCreateSuccess(''); setNewAccount(EMPTY_NEW_ACCOUNT); }}
        >
          <Text style={s.createBtnText}>+ Create Account</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={renderUser}
        style={s.list}
        contentContainerStyle={filtered.length === 0 ? s.listEmptyContent : s.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchUsers(); }}
            tintColor={theme.primaryLight}
          />
        }
        ListHeaderComponent={
          <View style={s.warningBanner}>
            <Text style={{ fontSize: 18 }}>🔒</Text>
            <Text style={s.warningText}>
              <Text style={{ fontWeight: 'bold' }}>Administrator Access Policy: </Text>
              You may view and edit user account details for operational purposes only. Logging into or impersonating any user account is strictly prohibited under RA 10173. All admin actions are audit-logged.
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={s.emptyCard}>
            <Text style={s.emptyIcon}>👤</Text>
            <Text style={s.emptyTitle}>No users found</Text>
          </View>
        }
        ListFooterComponent={<View style={{ height: 40 }} />}
      />

      {/* ── Edit Modal ── */}
      <Modal visible={!!editingUser} animationType="slide" transparent onRequestClose={closeEdit}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <View>
                <Text style={s.modalTitle}>Edit User</Text>
                {editingUser && (
                  <Text style={s.modalSubtitle}>{editingUser.email}</Text>
                )}
              </View>
              <TouchableOpacity onPress={closeEdit}>
                <Text style={s.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

              {/* ── Profile section ── */}
              {editError ? <Text style={s.errorText}>{editError}</Text> : null}
              {editSuccess ? <Text style={s.successText}>{editSuccess}</Text> : null}

              <Text style={s.fieldLabel}>First Name</Text>
              <TextInput style={s.input} value={editForm.first_name}
                onChangeText={v => setEditForm(f => ({ ...f, first_name: v }))}
                placeholderTextColor={theme.textMuted} />

              <Text style={s.fieldLabel}>Last Name</Text>
              <TextInput style={s.input} value={editForm.last_name}
                onChangeText={v => setEditForm(f => ({ ...f, last_name: v }))}
                placeholderTextColor={theme.textMuted} />

              <Text style={s.fieldLabel}>Phone</Text>
              <TextInput style={s.input} value={editForm.phone}
                onChangeText={v => setEditForm(f => ({ ...f, phone: v }))}
                placeholder="09XX XXX XXXX" placeholderTextColor={theme.textMuted}
                keyboardType="phone-pad" />

              <Text style={s.fieldLabel}>Role</Text>
              <View style={s.roleRow}>
                {['customer', 'mechanic', 'staff', 'admin'].map(r => (
                  <TouchableOpacity
                    key={r}
                    style={[s.roleChip, editForm.role === r && s.roleChipActive]}
                    onPress={() => setEditForm(f => ({ ...f, role: r }))}
                  >
                    <Text style={[s.roleChipText, editForm.role === r && s.roleChipTextActive]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {editForm.role === 'mechanic' && (
                <>
                  <Text style={s.fieldLabel}>Specialization</Text>
                  <TextInput style={s.input} value={editForm.specialization}
                    onChangeText={v => setEditForm(f => ({ ...f, specialization: v }))}
                    placeholder="e.g. Engine Repair" placeholderTextColor={theme.textMuted} />
                </>
              )}

              {editForm.role === 'customer' && (
                <>
                  <Text style={s.fieldLabel}>Motorcycle Make</Text>
                  <TextInput style={s.input} value={editForm.moto_make}
                    onChangeText={v => setEditForm(f => ({ ...f, moto_make: v }))}
                    placeholder="e.g. Yamaha" placeholderTextColor={theme.textMuted} />
                  <Text style={s.fieldLabel}>Motorcycle Model</Text>
                  <TextInput style={s.input} value={editForm.moto_model}
                    onChangeText={v => setEditForm(f => ({ ...f, moto_model: v }))}
                    placeholder="e.g. Aerox 155" placeholderTextColor={theme.textMuted} />
                  <Text style={s.fieldLabel}>Year</Text>
                  <TextInput style={s.input} value={editForm.moto_year}
                    onChangeText={v => setEditForm(f => ({ ...f, moto_year: v }))}
                    placeholder="e.g. 2023" placeholderTextColor={theme.textMuted}
                    keyboardType="number-pad" />
                </>
              )}

              <View style={s.modalActions}>
                <TouchableOpacity style={s.cancelBtn} onPress={closeEdit}>
                  <Text style={s.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.saveBtn} onPress={handleSaveEdit} disabled={saving}>
                  {saving
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={s.saveBtnText}>Save Changes</Text>
                  }
                </TouchableOpacity>
              </View>

              {/* Demote button — mechanic, staff, and other admins */}
              {editingUser && (editForm.role === 'mechanic' || editForm.role === 'staff' || (editForm.role === 'admin' && editingUser.id !== adminId)) && (
                <TouchableOpacity
                  style={s.demoteModalBtn}
                  onPress={() => { handleDemote(editingUser?.id, editForm.role); closeEdit(); }}
                >
                  <Text style={s.demoteModalBtnText}>Remove {editForm.role} access (demote to customer)</Text>
                </TouchableOpacity>
              )}

              {/* ── Change Password section ── */}
              <View style={s.passwordSection}>
                <Text style={s.passwordSectionTitle}>🔑 Change Password</Text>

                {passwordError ? <Text style={s.errorText}>{passwordError}</Text> : null}
                {passwordSuccess ? <Text style={s.successText}>{passwordSuccess}</Text> : null}

                <Text style={s.fieldLabel}>New Password</Text>
                <TextInput
                  style={s.input}
                  value={newPassword}
                  onChangeText={v => { setNewPassword(v); setPasswordError(''); setPasswordSuccess(''); }}
                  placeholder="Min. 6 characters"
                  placeholderTextColor={theme.textMuted}
                  secureTextEntry
                  autoComplete="new-password"
                />

                <Text style={s.fieldLabel}>Confirm New Password</Text>
                <TextInput
                  style={s.input}
                  value={confirmNewPassword}
                  onChangeText={v => { setConfirmNewPassword(v); setPasswordError(''); setPasswordSuccess(''); }}
                  placeholder="Re-enter new password"
                  placeholderTextColor={theme.textMuted}
                  secureTextEntry
                  autoComplete="new-password"
                />

                <TouchableOpacity
                  style={[s.changePasswordBtn, (changingPassword || !newPassword) && { opacity: 0.4 }]}
                  onPress={handleChangePassword}
                  disabled={changingPassword || !newPassword}
                >
                  {changingPassword
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={s.changePasswordBtnText}>Update Password</Text>
                  }
                </TouchableOpacity>
                <Text style={s.passwordHint}>
                  This action is audit-logged. The user will need to use the new password on their next login.
                </Text>
              </View>

              <View style={{ height: 24 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Create Account Modal ── */}
      <Modal visible={showCreate} animationType="slide" transparent onRequestClose={() => setShowCreate(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Create New Account</Text>
              <TouchableOpacity onPress={() => setShowCreate(false)}>
                <Text style={s.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              {createError ? <Text style={s.errorText}>{createError}</Text> : null}
              {createSuccess ? <Text style={s.successText}>{createSuccess}</Text> : null}

              <Text style={s.fieldLabel}>Role</Text>
              <View style={s.roleRow}>
                {['mechanic', 'staff', 'customer', 'admin'].map(r => (
                  <TouchableOpacity
                    key={r}
                    style={[s.roleChip, newAccount.role === r && s.roleChipActive]}
                    onPress={() => setNewAccount(a => ({ ...a, role: r }))}
                  >
                    <Text style={[s.roleChipText, newAccount.role === r && s.roleChipTextActive]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.fieldLabel}>First Name *</Text>
              <TextInput style={s.input} value={newAccount.firstName}
                onChangeText={v => setNewAccount(a => ({ ...a, firstName: v }))}
                placeholderTextColor={theme.textMuted} placeholder="First Name" />

              <Text style={s.fieldLabel}>Last Name *</Text>
              <TextInput style={s.input} value={newAccount.lastName}
                onChangeText={v => setNewAccount(a => ({ ...a, lastName: v }))}
                placeholderTextColor={theme.textMuted} placeholder="Last Name" />

              <Text style={s.fieldLabel}>Email *</Text>
              <TextInput style={s.input} value={newAccount.email}
                onChangeText={v => setNewAccount(a => ({ ...a, email: v }))}
                placeholderTextColor={theme.textMuted} placeholder="email@example.com"
                keyboardType="email-address" autoCapitalize="none" />

              <Text style={s.fieldLabel}>Phone</Text>
              <TextInput style={s.input} value={newAccount.phone}
                onChangeText={v => setNewAccount(a => ({ ...a, phone: v }))}
                placeholderTextColor={theme.textMuted} placeholder="09XX XXX XXXX"
                keyboardType="phone-pad" />

              <Text style={s.fieldLabel}>Password *</Text>
              <TextInput style={s.input} value={newAccount.password}
                onChangeText={v => setNewAccount(a => ({ ...a, password: v }))}
                placeholderTextColor={theme.textMuted} placeholder="Min 6 characters"
                secureTextEntry />

              <Text style={s.fieldLabel}>Confirm Password *</Text>
              <TextInput style={s.input} value={newAccount.confirmPassword}
                onChangeText={v => setNewAccount(a => ({ ...a, confirmPassword: v }))}
                placeholderTextColor={theme.textMuted} placeholder="Repeat password"
                secureTextEntry />

              <View style={s.modalActions}>
                <TouchableOpacity style={s.cancelBtn} onPress={() => setShowCreate(false)}>
                  <Text style={s.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.saveBtn} onPress={handleCreateAccount} disabled={creating}>
                  {creating
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={s.saveBtnText}>Create Account</Text>
                  }
                </TouchableOpacity>
              </View>
              <View style={{ height: 24 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Policy Modal ── */}
      <Modal visible={showPolicy} transparent animationType="fade" onRequestClose={() => setShowPolicy(false)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowPolicy(false)}>
          <View style={[s.modalSheet, { margin: 20, borderRadius: 16 }]} onStartShouldSetResponder={() => true}>
            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#fbbf24', marginBottom: 12 }}>
              ⚠️ Republic Act No. 10173 Compliance Policy
            </Text>
            <Text style={{ fontSize: 13, color: theme.textSub, lineHeight: 20, marginBottom: 12 }}>
              In accordance with the Data Privacy Act of 2012 (RA 10173), administrators are strictly barred from accessing, altering, or logging into any accounts that contain protected personal or identifiable information unless explicitly authorized for standard operational updates.
            </Text>
            <View style={{ backgroundColor: theme.bg2, borderRadius: 10, padding: 12, marginBottom: 16, gap: 8 }}>
              <Text style={{ fontSize: 12, color: theme.textMuted, lineHeight: 18 }}>
                • <Text style={{ fontWeight: 'bold' }}>Strict Auditing:</Text> Every adjustment made inside the administrative interface logs a permanent footprint attaching your session profile ID.
              </Text>
              <Text style={{ fontSize: 12, color: theme.textMuted, lineHeight: 18 }}>
                • <Text style={{ fontWeight: 'bold' }}>Credentials Rules:</Text> Passwords are cryptographically salted and hashed. Impersonating user workflows or requesting credentials is prohibited.
              </Text>
            </View>
            <TouchableOpacity
              style={{ backgroundColor: theme.primary, borderRadius: 10, padding: 14, alignItems: 'center' }}
              onPress={() => setShowPolicy(false)}
            >
              <Text style={{ color: '#fff', fontWeight: '600' }}>I Understand</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    height: 44, marginHorizontal: 12, marginTop: 10, marginBottom: 6,
    backgroundColor: theme.bg2, borderRadius: 10, borderWidth: 1,
    borderColor: theme.border, paddingHorizontal: 12,
  },
  searchInput: { flex: 1, fontSize: 14, color: theme.text },
  searchClear: { padding: 4 },

  filterBarWrap: { height: 46, borderBottomWidth: 1, borderBottomColor: theme.border },
  filterContent: { paddingHorizontal: 12, paddingVertical: 6, gap: 6, alignItems: 'center' },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border,
  },
  filterChipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  filterText: { fontSize: 12, color: theme.textSub, fontWeight: '500', textTransform: 'capitalize' },
  filterTextActive: { color: '#fff', fontWeight: 'bold' },

  createBtnRow: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6,
  },
  createBtn: {
    backgroundColor: theme.primary, borderRadius: 10,
    padding: 11, alignItems: 'center',
  },
  createBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },

  list: { flex: 1 },
  listContent: { paddingTop: 4 },
  listEmptyContent: { flex: 1 },

  warningBanner: {
    backgroundColor: '#422006', borderWidth: 1, borderColor: '#854d0e',
    borderRadius: 12, padding: 14, marginHorizontal: 12, marginBottom: 12,
    flexDirection: 'row', gap: 10,
  },
  warningText: { color: '#fbbf24', fontSize: 12, flex: 1, lineHeight: 18 },

  emptyCard: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 48 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: 'bold', color: theme.text },

  card: {
    backgroundColor: theme.card, marginHorizontal: 12, marginBottom: 12,
    borderRadius: 14, borderWidth: 1, borderColor: theme.border, overflow: 'hidden',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', padding: 14, gap: 12 },
  avatarWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.primary, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  avatarText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  userName: { fontSize: 15, fontWeight: 'bold', color: theme.text },
  selfLabel: { fontSize: 11, color: theme.textMuted },
  roleBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  roleBadgeText: { fontSize: 11, fontWeight: 'bold', textTransform: 'capitalize' },
  userEmail: { fontSize: 12, color: theme.textSub, marginTop: 2 },
  userPhone: { fontSize: 12, color: theme.textMuted, marginTop: 1 },
  statsRow: { marginTop: 4, gap: 2 },
  specText: { fontSize: 12, color: theme.primaryLight },
  statText: { fontSize: 11, color: theme.textMuted },
  ratingText: { fontSize: 11, color: '#eab308' },
  motoText: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 14, paddingBottom: 14 },
  editBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: theme.primary + '18', borderWidth: 1, borderColor: theme.primary + '44' },
  editBtnText: { fontSize: 12, fontWeight: '600', color: theme.primaryLight },
  demoteBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: '#ef444418', borderWidth: 1, borderColor: '#ef444444' },
  demoteBtnText: { fontSize: 12, fontWeight: '600', color: '#ef4444' },
  scheduleBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: '#3b82f618', borderWidth: 1, borderColor: '#3b82f644' },
  scheduleBtnActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  scheduleBtnText: { fontSize: 12, fontWeight: '600', color: '#3b82f6' },
  scheduleBtnTextActive: { color: '#fff' },

  expandedPanel: { borderTopWidth: 1, borderTopColor: theme.border, padding: 14, backgroundColor: theme.bg2 },
  panelTitle: { fontSize: 14, fontWeight: 'bold', color: theme.text, marginBottom: 10 },
  emptyText: { fontSize: 13, color: theme.textMuted, marginBottom: 8 },
  scheduleCard: { backgroundColor: theme.card, borderRadius: 10, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: theme.border },
  scheduleCustomer: { fontSize: 13, fontWeight: '600', color: theme.text },
  scheduleSub: { fontSize: 12, color: theme.textSub, marginTop: 2 },
  statusBadge: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginTop: 4 },
  statusBadgeText: { fontSize: 11, fontWeight: 'bold', textTransform: 'capitalize' },
  certRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.card, borderRadius: 10, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: theme.border },
  certName: { fontSize: 13, fontWeight: '600', color: theme.text },
  certDate: { fontSize: 11, color: theme.textMuted, marginTop: 2 },
  certActions: { flexDirection: 'row', gap: 6 },
  viewBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: theme.primary + '18', borderWidth: 1, borderColor: theme.primary + '44' },
  viewBtnText: { fontSize: 12, color: theme.primaryLight, fontWeight: '600' },
  deleteBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#ef444418', borderWidth: 1, borderColor: '#ef444444' },
  deleteBtnText: { fontSize: 12, color: '#ef4444', fontWeight: '600' },
  certError: { color: '#ef4444', fontSize: 13, marginBottom: 8 },
  uploadForm: { marginTop: 12, backgroundColor: theme.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.border },
  uploadFormTitle: { fontSize: 13, fontWeight: 'bold', color: theme.text, marginBottom: 10 },
  filePickerBtn: { borderWidth: 1, borderColor: theme.border, borderRadius: 10, padding: 10, marginBottom: 10, backgroundColor: theme.bg2, alignItems: 'center' },
  filePickerBtnText: { fontSize: 13, color: theme.textSub },
  uploadBtn: { backgroundColor: theme.primary, borderRadius: 10, padding: 12, alignItems: 'center' },
  uploadBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet: { backgroundColor: theme.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: 'bold', color: theme.text },
  modalSubtitle: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  modalClose: { fontSize: 20, color: theme.textMuted },
  fieldLabel: { fontSize: 12, color: theme.textMuted, marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: theme.border, borderRadius: 10, padding: 12, fontSize: 14, color: theme.text, backgroundColor: theme.bg2, marginBottom: 4 },
  roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  roleChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border },
  roleChipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  roleChipText: { fontSize: 13, color: theme.textSub, textTransform: 'capitalize' },
  roleChipTextActive: { color: '#fff', fontWeight: 'bold' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: theme.border, borderRadius: 10, padding: 14, alignItems: 'center' },
  cancelBtnText: { color: theme.text, fontWeight: '600' },
  saveBtn: { flex: 1, backgroundColor: theme.primary, borderRadius: 10, padding: 14, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: 'bold' },
  demoteModalBtn: { marginTop: 12, borderWidth: 1, borderColor: '#ef444444', borderRadius: 10, padding: 14, alignItems: 'center', backgroundColor: '#ef444418' },
  demoteModalBtnText: { color: '#ef4444', fontWeight: '600', fontSize: 13 },

  // Password change section
  passwordSection: {
    marginTop: 24, paddingTop: 20,
    borderTopWidth: 1, borderTopColor: theme.border,
  },
  passwordSectionTitle: {
    fontSize: 14, fontWeight: 'bold', color: theme.text, marginBottom: 4,
  },
  changePasswordBtn: {
    marginTop: 16, backgroundColor: theme.bg2, borderWidth: 1,
    borderColor: theme.border, borderRadius: 10, padding: 14, alignItems: 'center',
  },
  changePasswordBtnText: { color: theme.text, fontWeight: '600', fontSize: 14 },
  passwordHint: {
    fontSize: 11, color: theme.textMuted, marginTop: 8, lineHeight: 16,
  },

  errorText: { color: '#ef4444', fontSize: 13, marginBottom: 8, backgroundColor: '#ef444418', padding: 10, borderRadius: 8 },
  successText: { color: '#22c55e', fontSize: 13, marginBottom: 8, backgroundColor: '#22c55e18', padding: 10, borderRadius: 8 },
});