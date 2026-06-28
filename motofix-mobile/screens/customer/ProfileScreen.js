import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Switch, Alert, Image, TextInput,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../lib/ThemeContext';
import { supabase } from '../../lib/supabase';
import { unregisterPushToken } from '../../lib/pushNotifications';
import { CommonActions } from '@react-navigation/native';


export default function ProfileScreen({ navigation }) {
  const { theme, isDark, toggleTheme } = useTheme();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [certificates, setCertificates] = useState([]);
  const [loadingCerts, setLoadingCerts] = useState(false);

  // Form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [motoMake, setMotoMake] = useState('');
  const [motoModel, setMotoModel] = useState('');
  const [motoYear, setMotoYear] = useState('');

  // Photo state
  const [photoUri, setPhotoUri] = useState(null);
  const [savedPhotoUrl, setSavedPhotoUrl] = useState(null);

  // Certificate State variables
  const [certName, setCertName] = useState('');
  const [certFile, setCertFile] = useState(null);
  const [uploadingCert, setUploadingCert] = useState(false);
  const [certError, setCertError] = useState('');
  const [deletingCertId, setDeletingCertId] = useState(null);

  useEffect(() => { fetchProfile(); }, []);

  async function fetchProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (data) {
      setProfile(data);
      setFirstName(data.first_name || '');
      setLastName(data.last_name || '');
      setPhone(data.phone || '');
      setSpecialization(data.specialization || '');
      setMotoMake(data.moto_make || '');
      setMotoModel(data.moto_model || '');
      setMotoYear(data.moto_year ? String(data.moto_year) : '');

      setSavedPhotoUrl(data.profile_photo_url || null);
      setPhotoUri(data.profile_photo_url || null);

      if (data.role === 'mechanic') fetchCertificates(user.id);
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

  async function pickPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo library access to change your photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets[0]) {
      const selectedAsset = result.assets[0];
      if (selectedAsset?.uri) {
        setPhotoUri(selectedAsset.uri);
      } else {
        Alert.alert('Error', 'Unable to retrieve image path.');
      }
    }
  }

  async function uploadPhoto(localUri) {
    if (!localUri) throw new Error('No local image path available');

    const { data: { user } } = await supabase.auth.getUser();
    const ext = localUri.match(/\.(\w+)$/)?.[1]?.toLowerCase() || 'jpg';
    const prefix = profile?.role === 'mechanic' ? 'mechanic' : 'profile';
    const filePath = `${user.id}/${prefix}_${Date.now()}.${ext}`;

    setUploadingPhoto(true);
    try {
      const response = await fetch(localUri);
      const arrayBuffer = await response.arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from('motorcycle-photos')
        .upload(filePath, arrayBuffer, {
          contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('motorcycle-photos')
        .getPublicUrl(filePath);

      return urlData.publicUrl;
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleSave() {
    const { data: { user } } = await supabase.auth.getUser();
    setSaving(true);

    try {
      let newPhotoUrl = null;

      if (photoUri && photoUri !== savedPhotoUrl) {
        newPhotoUrl = await uploadPhoto(photoUri);
      }

      const payload = {
        first_name: firstName,
        last_name: lastName,
        phone: phone || null,
      };

      if (newPhotoUrl) payload.profile_photo_url = newPhotoUrl;

      if (profile?.role === 'mechanic') {
        payload.specialization = specialization || null;
      } else {
        payload.moto_make = motoMake || null;
        payload.moto_model = motoModel || null;
        payload.moto_year = motoYear ? parseInt(motoYear) : null;
      }

      const { error } = await supabase
        .from('profiles')
        .update(payload)
        .eq('id', user.id);

      if (error) throw error;

      if (newPhotoUrl) setSavedPhotoUrl(newPhotoUrl);
      Alert.alert('✅ Success', 'Profile updated successfully!');
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  }

async function handleLogout() {
  try {
    await supabase.auth.signOut();
  } catch (error) {
    console.log('Logout error:', error.message);
  }

  const resetAction = CommonActions.reset({
    index: 0,
    routes: [{ name: 'Login' }],
  });

  const rootNavigation =
    navigation.getParent()?.getParent() ||
    navigation.getParent() ||
    navigation;

  rootNavigation.dispatch(resetAction);
}

  async function pickCertFile() {
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
      Alert.alert('Error', 'Could not pick file: ' + err.message);
    }
  }

  async function handleUploadCertificate() {
    setCertError('');
    if (!certName.trim()) { setCertError('Please enter a certificate name.'); return; }
    if (!certFile) { setCertError('Please pick a file.'); return; }
    setUploadingCert(true);
    try {
      const ext = certFile.name.split('.').pop() || 'pdf';
      const filePath = `${profile.id}/${Date.now()}.${ext}`;
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
          mechanic_id: profile.id,
          name: certName.trim(),
          file_url: urlData.publicUrl,
          uploaded_by: profile.id,
        });
      if (insertError) throw insertError;
      setCertName('');
      setCertFile(null);
      Alert.alert('✅ Success', 'Certificate uploaded!');
      fetchCertificates(profile.id);
    } catch (err) {
      setCertError(err.message);
    } finally {
      setUploadingCert(false);
    }
  }

  async function handleDeleteCertificate(cert) {
    Alert.alert('Delete Certificate', `Delete "${cert.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          setDeletingCertId(cert.id);
          await supabase.from('mechanic_certificates').delete().eq('id', cert.id);
          setDeletingCertId(null);
          fetchCertificates(profile.id);
        }
      }
    ]);
  }

  const s = styles(theme);
  const isMechanic = profile?.role === 'mechanic';
  const displayPhoto = photoUri || savedPhotoUrl;

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

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

      {/* ── Photo Section ── */}
      <View style={s.photoCard}>
        <TouchableOpacity onPress={pickPhoto} style={s.photoWrap} activeOpacity={0.8}>
          {displayPhoto ? (
            <Image
              source={{ uri: displayPhoto }}
              style={s.avatarCircle}
              resizeMode="cover"
            />
          ) : (
            <View style={[s.avatarCircle, s.avatarPlaceholder]}>
              <Text style={s.avatarInitials}>{initials}</Text>
            </View>
          )}

          {/* Camera badge */}
          <View style={s.cameraBadge}>
            <Text style={{ fontSize: 14 }}>📷</Text>
          </View>
        </TouchableOpacity>

        <View style={s.photoInfo}>
          <Text style={s.photoTitle}>Profile Photo</Text>
          <Text style={s.photoSubtitle}>
            Tap the photo to change it
          </Text>
          {uploadingPhoto && (
            <ActivityIndicator size="small" color={theme.primaryLight} style={{ marginTop: 6 }} />
          )}
          {photoUri && photoUri !== savedPhotoUrl && !uploadingPhoto && (
            <Text style={s.photoChanged}>📸 New photo selected — tap Save</Text>
          )}
        </View>
      </View>

      {/* ── Account Info ── */}
      <Text style={s.sectionLabel}>Account Information</Text>
      <View style={s.card}>
        <FieldRow
          theme={theme}
          icon="person-outline"
          label="First Name"
          value={firstName}
          onChange={firstName}
          placeholder="First name"
        />
        <FieldRow
          theme={theme}
          icon="person-outline"
          label="Last Name"
          value={lastName}
          onChange={lastName}
          placeholder="Last name"
        />
        <FieldRow
          theme={theme}
          icon="call-outline"
          label="Phone"
          value={phone}
          onChange={phone}
          placeholder="09XX XXX XXXX"
          keyboardType="phone-pad"
          last
        />
      </View>

      {/* ── Mechanic Info ── */}
      {isMechanic && (
        <>
          <Text style={s.sectionLabel}>Mechanic Profile</Text>
          <View style={s.card}>
            <FieldRow
              theme={theme}
              icon="construct-outline"
              label="Specialization"
              value={specialization}
              onChange={specialization}
              placeholder="e.g. Engine Repair, Electrical"
              last
            />
          </View>
        </>
      )}

      {/* ── Motorcycle Info (customers) ── */}
      {!isMechanic && (
        <>
          <Text style={s.sectionLabel}>My Motorcycle</Text>
          <View style={s.card}>
            <FieldRow
              theme={theme}
              icon="bicycle-outline"
              label="Make"
              value={motoMake}
              onChange={motoMake}
              placeholder="e.g. Yamaha"
            />
            <FieldRow
              theme={theme}
              icon="bicycle-outline"
              label="Model"
              value={motoModel}
              onChange={motoModel}
              placeholder="e.g. Aerox 155"
            />
            <FieldRow
              theme={theme}
              icon="calendar-outline"
              label="Year"
              value={motoYear}
              onChange={motoYear}
              placeholder="e.g. 2023"
              keyboardType="number-pad"
              last
            />
          </View>
        </>
      )}

      {/* ── Preferences ── */}
      <Text style={s.sectionLabel}>Preferences</Text>
      <View style={s.card}>
        <View style={s.toggleRow}>
          <View style={s.toggleLeft}>
            <Ionicons
              name={isDark ? 'moon' : 'sunny'}
              size={20}
              color={theme.primaryLight}
              style={{ marginRight: 12 }}
            />
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

      {/* ── Certificates Management Section ── */}
      {isMechanic && (
        <>
          <Text style={s.sectionLabel}>My Certificates</Text>
          <View style={s.card}>
            {/* Error */}
            {certError ? (
              <View style={{ backgroundColor: '#ef444418', borderRadius: 8, padding: 10, margin: 14, marginBottom: 0 }}>
                <Text style={{ color: '#ef4444', fontSize: 13 }}>{certError}</Text>
              </View>
            ) : null}
            {/* Upload form */}
            <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: theme.border }}>
              <Text style={{ fontSize: 12, fontWeight: 'bold', color: theme.textMuted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Upload New Certificate
              </Text>
              <TextInput
                style={{
                  borderWidth: 1, borderColor: theme.border, borderRadius: 10,
                  padding: 12, fontSize: 14, color: theme.text,
                  backgroundColor: theme.bg2, marginBottom: 10,
                }}
                placeholder="Certificate name (e.g. TESDA NC II)"
                placeholderTextColor={theme.textMuted}
                value={certName}
                onChangeText={setCertName}
              />
              <TouchableOpacity
                style={{
                  borderWidth: 1, borderColor: theme.border, borderRadius: 10,
                  padding: 12, marginBottom: 10, backgroundColor: theme.bg2,
                  alignItems: 'center',
                }}
                onPress={pickCertFile}
              >
                <Text style={{ fontSize: 13, color: certFile ? theme.primaryLight : theme.textSub }}>
                  {certFile ? `📄 ${certFile.name}` : '📁 Pick file (image or PDF)'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  backgroundColor: theme.primary, borderRadius: 10,
                  padding: 12, alignItems: 'center',
                  opacity: uploadingCert ? 0.6 : 1,
                }}
                onPress={handleUploadCertificate}
                disabled={uploadingCert}
              >
                {uploadingCert
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>+ Upload Certificate</Text>
                }
              </TouchableOpacity>
            </View>
            {/* Certificates list */}
            {loadingCerts ? (
              <View style={{ padding: 16, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={theme.primaryLight} />
              </View>
            ) : certificates.length === 0 ? (
              <View style={{ padding: 16 }}>
                <Text style={{ fontSize: 13, color: theme.textMuted }}>No certificates uploaded yet.</Text>
              </View>
            ) : (
              certificates.map((c, index) => (
                <View
                  key={c.id}
                  style={[
                    s.certRow,
                    index < certificates.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border },
                  ]}
                >
                  <Text style={{ fontSize: 18, marginRight: 12 }}>📄</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.certName}>{c.name}</Text>
                    <Text style={s.certDate}>
                      Uploaded {new Date(c.created_at).toLocaleDateString()}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => {
                        const { Linking } = require('react-native');
                        Linking.openURL(c.file_url);
                      }}
                      style={s.viewCertBtn}
                    >
                      <Text style={s.viewCertBtnText}>View</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDeleteCertificate(c)}
                      disabled={deletingCertId === c.id}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: '#ef444444',
                        backgroundColor: '#ef444418',
                        opacity: deletingCertId === c.id ? 0.5 : 1,
                      }}
                    >
                      <Text style={{ fontSize: 12, color: '#ef4444', fontWeight: '600' }}>
                        {deletingCertId === c.id ? '...' : 'Delete'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        </>
      )}

      {/* ── Save Button ── */}
      <TouchableOpacity
        style={[s.saveBtn, (saving || uploadingPhoto) && { opacity: 0.6 }]}
        onPress={handleSave}
        disabled={saving || uploadingPhoto}
      >
        {(saving || uploadingPhoto) ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={s.saveBtnText}>Save Changes</Text>
        )}
      </TouchableOpacity>

      {/* ── Logout ── */}
      <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
        <Text style={s.logoutText}>Log Out</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ── Reusable editable field row ──
function FieldRow({ theme, icon, label, value, onChange, placeholder, keyboardType = 'default', last }) {
  const [focused, setFocused] = useState(false);
  const { TextInput } = require('react-native');

  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      padding: 14,
      borderBottomWidth: last ? 0 : 1,
      borderBottomColor: theme.border,
    }}>
      <Ionicons name={icon} size={18} color={theme.textMuted} style={{ marginRight: 12 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 11, color: theme.textMuted, marginBottom: 2 }}>{label}</Text>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={theme.textMuted}
          keyboardType={keyboardType}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            fontSize: 14,
            color: theme.text,
            paddingVertical: 0,
            borderBottomWidth: focused ? 1 : 0,
            borderBottomColor: theme.primary,
          }}
        />
      </View>
    </View>
  );
}

const styles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg },
  content: { padding: 20, paddingBottom: 40 },

  // Photo card
  photoCard: {
    backgroundColor: theme.card,
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 24,
  },
  photoWrap: { position: 'relative' },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: theme.primary,
  },
  motoPhoto: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: theme.primary,
  },
  avatarPlaceholder: {
    backgroundColor: theme.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitials: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  cameraBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.bg,
  },
  photoInfo: { flex: 1 },
  photoTitle: { fontSize: 15, fontWeight: 'bold', color: theme.text, marginBottom: 4 },
  photoSubtitle: { fontSize: 12, color: theme.textMuted },
  photoChanged: { fontSize: 11, color: theme.success || '#22c55e', marginTop: 6 },

  // Sections
  sectionLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: theme.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 20,
    overflow: 'hidden',
  },

  // Toggle
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  toggleLeft: { flexDirection: 'row', alignItems: 'center' },
  toggleLabel: { fontSize: 14, color: theme.text, fontWeight: '600' },
  toggleSub: { fontSize: 12, color: theme.textMuted, marginTop: 1 },

  // Certificates
  certRow: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  certName: { fontSize: 14, color: theme.text, fontWeight: '500' },
  certDate: { fontSize: 11, color: theme.textMuted, marginTop: 2 },
  viewCertBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.primary + '44',
    backgroundColor: theme.primary + '18',
  },
  viewCertBtnText: { fontSize: 12, color: theme.primaryLight, fontWeight: '600' },

  // Buttons
  saveBtn: {
    backgroundColor: theme.primary,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  saveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  logoutBtn: {
    flexDirection: 'row',
    backgroundColor: '#DC2626',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});