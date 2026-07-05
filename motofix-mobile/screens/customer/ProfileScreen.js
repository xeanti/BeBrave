import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { CommonActions } from '@react-navigation/native';
import { useTheme } from '../../lib/ThemeContext';
import { supabase } from '../../lib/supabase';
import { unregisterPushToken } from '../../lib/pushNotifications';

const PHONE_PREFIX = '09';
const MIN_MOTORCYCLE_YEAR = 1980;
const MAX_MOTORCYCLE_YEAR = new Date().getFullYear() + 1;
const MAX_PASSWORD_LENGTH = 72;
const MAX_PROFILE_PHOTO_MB = 5;
const MAX_CERT_SIZE_MB = 10;
const ALLOWED_CERT_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'pdf'];
const ALLOWED_PROFILE_PHOTO_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

function cleanName(value) {
  return String(value || '')
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[^a-zA-ZñÑ .'-]/g, '')
    .replace(/\s+/g, ' ')
    .trimStart()
    .slice(0, 50);
}

function cleanMotorcycleText(value) {
  return String(value || '')
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[^a-zA-Z0-9ñÑ .,'’()\-/+&]/g, '')
    .replace(/\s+/g, ' ')
    .trimStart()
    .slice(0, 60);
}

function cleanSpecialization(value) {
  return String(value || '')
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[^a-zA-Z0-9ñÑ .,'’()\-/+&#]/g, '')
    .replace(/\s+/g, ' ')
    .trimStart()
    .slice(0, 80);
}

function cleanCertName(value) {
  return String(value || '')
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[^a-zA-Z0-9ñÑ .,'’()\-/+&#]/g, '')
    .replace(/\s+/g, ' ')
    .trimStart()
    .slice(0, 80);
}

function cleanPassword(value) {
  return String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .slice(0, MAX_PASSWORD_LENGTH);
}

function formatPhoneInput(value) {
  const digits = String(value || '').replace(/\D/g, '');

  if (!digits || digits.length <= 2) {
    return PHONE_PREFIX;
  }

  const numberAfterPrefix = digits.startsWith(PHONE_PREFIX)
    ? digits.slice(2)
    : digits;

  return (PHONE_PREFIX + numberAfterPrefix).slice(0, 11);
}

function isValidPhilippineMobile(value) {
  return /^09\d{9}$/.test(value);
}

function cleanYear(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 4);
}

function isValidMotorcycleYear(value) {
  if (!value) return true;

  const year = Number(value);

  return (
    /^\d{4}$/.test(value) &&
    Number.isInteger(year) &&
    year >= MIN_MOTORCYCLE_YEAR &&
    year <= MAX_MOTORCYCLE_YEAR
  );
}

function normalizeNullableText(value) {
  const clean = String(value || '').trim();
  return clean.length ? clean : null;
}

function getFileExtension(name = '') {
  return String(name || '')
    .split('.')
    .pop()
    ?.toLowerCase()
    .replace(/[^a-z0-9]/g, '') || '';
}

function isAllowedCertificateFile(asset) {
  if (!asset) return false;

  const ext = getFileExtension(asset.name);
  const size = Number(asset.size || 0);
  const validExt = ALLOWED_CERT_EXTENSIONS.includes(ext);
  const validType =
    String(asset.mimeType || '').startsWith('image/') ||
    asset.mimeType === 'application/pdf' ||
    ext === 'pdf';

  if (!validExt || !validType) return false;
  if (size && size > MAX_CERT_SIZE_MB * 1024 * 1024) return false;

  return true;
}

function isAllowedProfilePhoto(asset) {
  if (!asset) return false;

  const uriExt = getFileExtension(asset.fileName || asset.uri || '');
  const size = Number(asset.fileSize || asset.size || 0);
  const mimeType = String(asset.mimeType || asset.type || '').toLowerCase();

  const validExt =
    !uriExt || ALLOWED_PROFILE_PHOTO_EXTENSIONS.includes(uriExt);

  const validType =
    !mimeType ||
    ['image/jpeg', 'image/png', 'image/webp'].includes(mimeType);

  if (!validExt || !validType) return false;
  if (size && size > MAX_PROFILE_PHOTO_MB * 1024 * 1024) return false;

  return true;
}

function getMimeFromExtension(ext) {
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'pdf':
      return 'application/pdf';
    default:
      return 'application/octet-stream';
  }
}

export default function ProfileScreen({ navigation }) {
  const { theme, isDark, toggleTheme } = useTheme();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoUri, setPhotoUri] = useState(null);
  const [savedPhotoUrl, setSavedPhotoUrl] = useState(null);

  const [certificates, setCertificates] = useState([]);
  const [loadingCerts, setLoadingCerts] = useState(false);
  const [certName, setCertName] = useState('');
  const [certFile, setCertFile] = useState(null);
  const [uploadingCert, setUploadingCert] = useState(false);
  const [certError, setCertError] = useState('');
  const [deletingCertId, setDeletingCertId] = useState(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState(PHONE_PREFIX);
  const [specialization, setSpecialization] = useState('');
  const [motoMake, setMotoMake] = useState('');
  const [motoModel, setMotoModel] = useState('');
  const [motoYear, setMotoYear] = useState('');

  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const s = styles(theme);
  const isMechanic = profile?.role === 'mechanic';
  const displayPhoto = photoUri || savedPhotoUrl;
  const initials = profile
    ? `${profile.first_name?.[0] || ''}${profile.last_name?.[0] || ''}`.toUpperCase()
    : '?';

  useEffect(() => {
    fetchProfile();
  }, []);

  async function fetchProfile() {
    setLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setProfile(data);
        setFirstName(cleanName(data.first_name || ''));
        setLastName(cleanName(data.last_name || ''));
        setPhone(data.phone ? formatPhoneInput(data.phone) : PHONE_PREFIX);
        setSpecialization(cleanSpecialization(data.specialization || ''));
        setMotoMake(cleanMotorcycleText(data.moto_make || ''));
        setMotoModel(cleanMotorcycleText(data.moto_model || ''));
        setMotoYear(data.moto_year ? cleanYear(String(data.moto_year)) : '');

        setSavedPhotoUrl(data.profile_photo_url || null);
        setPhotoUri(data.profile_photo_url || null);

        if (data.role === 'mechanic') {
          fetchCertificates(user.id);
        }
      }
    } catch (error) {
      Alert.alert('Profile Error', error.message || 'Failed to load profile.');
    } finally {
      setLoading(false);
    }
  }

  async function fetchCertificates(mechanicId) {
    setLoadingCerts(true);

    try {
      const { data, error } = await supabase
        .from('mechanic_certificates')
        .select('*')
        .eq('mechanic_id', mechanicId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setCertificates(data || []);
    } catch (error) {
      setCertError(error.message || 'Failed to load certificates.');
    } finally {
      setLoadingCerts(false);
    }
  }

  async function pickPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== 'granted') {
      Alert.alert('Permission Needed', 'Please allow photo library access to change your photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets?.[0]) {
      const selectedAsset = result.assets[0];

      if (!isAllowedProfilePhoto(selectedAsset)) {
        Alert.alert(
          'Invalid Image',
          `Please upload a JPG, PNG, or WEBP profile photo up to ${MAX_PROFILE_PHOTO_MB}MB.`
        );
        return;
      }

      if (selectedAsset?.uri) {
        setPhotoUri(selectedAsset.uri);
      } else {
        Alert.alert('Error', 'Unable to retrieve image path.');
      }
    }
  }

  async function uploadPhoto(localUri) {
    if (!localUri) throw new Error('No local image path available.');

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) throw new Error('Login required.');

    const ext = getFileExtension(localUri) || 'jpg';
    const safeExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? ext : 'jpg';
    const contentType = safeExt === 'jpg' ? 'image/jpeg' : `image/${safeExt}`;
    const prefix = profile?.role === 'mechanic' ? 'mechanic' : 'profile';
    const filePath = `${user.id}/${prefix}_${Date.now()}.${safeExt}`;

    setUploadingPhoto(true);

    try {
      const response = await fetch(localUri);
      const arrayBuffer = await response.arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from('motorcycle-photos')
        .upload(filePath, arrayBuffer, {
          contentType,
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('motorcycle-photos')
        .getPublicUrl(filePath);

      if (!urlData?.publicUrl) {
        throw new Error('Uploaded photo URL was not generated.');
      }

      return urlData.publicUrl;
    } finally {
      setUploadingPhoto(false);
    }
  }

  function validateProfileForm() {
    const cleanFirstName = cleanName(firstName).trim();
    const cleanLastName = cleanName(lastName).trim();
    const cleanPhoneNumber = formatPhoneInput(phone);
    const cleanMotoYear = cleanYear(motoYear);

    if (!cleanFirstName || !cleanLastName) {
      return { error: 'Please enter your first name and last name.' };
    }

    if (!isValidPhilippineMobile(cleanPhoneNumber)) {
      return {
        error: 'Phone number must start with 09 and contain exactly 11 digits.',
      };
    }

    if (!isMechanic && cleanMotoYear && !isValidMotorcycleYear(cleanMotoYear)) {
      return {
        error: `Motorcycle year must be between ${MIN_MOTORCYCLE_YEAR} and ${MAX_MOTORCYCLE_YEAR}.`,
      };
    }

    return {
      cleanFirstName,
      cleanLastName,
      cleanPhoneNumber,
      cleanMotoYear,
    };
  }

  async function handleSave() {
    const validation = validateProfileForm();

    if (validation.error) {
      Alert.alert('Invalid Profile Details', validation.error);
      return;
    }

    Alert.alert(
      'Save Profile',
      'Save these profile changes?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Save',
          onPress: saveProfile,
        },
      ]
    );
  }

  async function saveProfile() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      Alert.alert('Login Required', 'Please login again before updating your profile.');
      return;
    }

    const validation = validateProfileForm();

    if (validation.error) {
      Alert.alert('Invalid Profile Details', validation.error);
      return;
    }

    setSaving(true);

    try {
      let newPhotoUrl = null;

      if (photoUri && photoUri !== savedPhotoUrl) {
        newPhotoUrl = await uploadPhoto(photoUri);
      }

      const payload = {
        first_name: validation.cleanFirstName,
        last_name: validation.cleanLastName,
        phone: validation.cleanPhoneNumber,
      };

      if (newPhotoUrl) {
        payload.profile_photo_url = newPhotoUrl;
      }

      if (isMechanic) {
        payload.specialization = normalizeNullableText(cleanSpecialization(specialization));
      } else {
        payload.moto_make = normalizeNullableText(cleanMotorcycleText(motoMake));
        payload.moto_model = normalizeNullableText(cleanMotorcycleText(motoModel));
        payload.moto_year = validation.cleanMotoYear
          ? parseInt(validation.cleanMotoYear, 10)
          : null;
      }

      const { error } = await supabase
        .from('profiles')
        .update(payload)
        .eq('id', user.id);

      if (error) throw error;

      if (newPhotoUrl) {
        setSavedPhotoUrl(newPhotoUrl);
      }

      setProfile((current) => ({
        ...current,
        ...payload,
      }));

      Alert.alert('Success', 'Profile updated successfully!');
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  }

  function validatePasswordForm() {
    const cleanCurrent = cleanPassword(currentPassword);
    const cleanNew = cleanPassword(newPassword);
    const cleanConfirm = cleanPassword(confirmNewPassword);

    if (!cleanCurrent) {
      return { error: 'Please enter your current password.' };
    }

    if (!cleanNew) {
      return { error: 'Please enter a new password.' };
    }

    if (cleanNew.length < 6) {
      return { error: 'New password must be at least 6 characters.' };
    }

    if (cleanNew.length > MAX_PASSWORD_LENGTH) {
      return { error: `Password must not exceed ${MAX_PASSWORD_LENGTH} characters.` };
    }

    if (cleanNew !== cleanConfirm) {
      return { error: 'New password and confirm password do not match.' };
    }

    if (cleanCurrent === cleanNew) {
      return { error: 'New password must be different from your current password.' };
    }

    return {
      cleanCurrent,
      cleanNew,
    };
  }

  async function handleChangePassword() {
    const validation = validatePasswordForm();

    if (validation.error) {
      Alert.alert('Invalid Password', validation.error);
      return;
    }

    Alert.alert(
      'Change Password',
      'Are you sure you want to change your password?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Change Password',
          style: 'destructive',
          onPress: changePassword,
        },
      ]
    );
  }

  async function changePassword() {
    const validation = validatePasswordForm();

    if (validation.error) {
      Alert.alert('Invalid Password', validation.error);
      return;
    }

    setChangingPassword(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.email) {
        throw new Error('Unable to confirm your account email. Please login again.');
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: validation.cleanCurrent,
      });

      if (signInError) {
        throw new Error('Current password is incorrect.');
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: validation.cleanNew,
      });

      if (updateError) throw updateError;

      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setShowPasswordSection(false);

      Alert.alert('Success', 'Password changed successfully.');
    } catch (error) {
      Alert.alert('Password Error', error.message || 'Failed to change password.');
    } finally {
      setChangingPassword(false);
    }
  }

  async function handleLogout() {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: logoutNow,
        },
      ]
    );
  }

  async function logoutNow() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user?.id) {
        await unregisterPushToken(user.id);
      }

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

        if (!isAllowedCertificateFile(asset)) {
          Alert.alert(
            'Invalid File',
            `Please upload JPG, PNG, WEBP, or PDF up to ${MAX_CERT_SIZE_MB}MB.`
          );
          return;
        }

        setCertFile({
          uri: asset.uri,
          name: asset.name,
          mimeType: asset.mimeType || getMimeFromExtension(getFileExtension(asset.name)),
          size: asset.size,
        });

        if (!certName) {
          setCertName(cleanCertName(asset.name.replace(/\.[^/.]+$/, '')));
        }
      }
    } catch (err) {
      Alert.alert('Error', `Could not pick file: ${err.message}`);
    }
  }

  async function handleUploadCertificate() {
    setCertError('');

    const safeCertName = cleanCertName(certName).trim();

    if (!safeCertName) {
      setCertError('Please enter a certificate name.');
      return;
    }

    if (!certFile) {
      setCertError('Please pick a file.');
      return;
    }

    if (!isAllowedCertificateFile(certFile)) {
      setCertError(`Please upload JPG, PNG, WEBP, or PDF up to ${MAX_CERT_SIZE_MB}MB.`);
      return;
    }

    Alert.alert(
      'Upload Certificate',
      `Upload "${safeCertName}"?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Upload',
          onPress: uploadCertificateNow,
        },
      ]
    );
  }

  async function uploadCertificateNow() {
    const safeCertName = cleanCertName(certName).trim();

    if (!safeCertName || !certFile) return;

    setUploadingCert(true);

    try {
      const ext = getFileExtension(certFile.name) || 'pdf';
      const safeExt = ALLOWED_CERT_EXTENSIONS.includes(ext) ? ext : 'pdf';
      const filePath = `${profile.id}/${Date.now()}.${safeExt}`;

      const response = await fetch(certFile.uri);
      const blob = await response.blob();

      const { error: uploadError } = await supabase.storage
        .from('mechanic-certificates')
        .upload(filePath, blob, {
          contentType: certFile.mimeType || getMimeFromExtension(safeExt),
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('mechanic-certificates')
        .getPublicUrl(filePath);

      const { error: insertError } = await supabase
        .from('mechanic_certificates')
        .insert({
          mechanic_id: profile.id,
          name: safeCertName,
          file_url: urlData.publicUrl,
          uploaded_by: profile.id,
        });

      if (insertError) throw insertError;

      setCertName('');
      setCertFile(null);
      Alert.alert('Success', 'Certificate uploaded.');
      fetchCertificates(profile.id);
    } catch (err) {
      setCertError(err.message || 'Failed to upload certificate.');
    } finally {
      setUploadingCert(false);
    }
  }

  async function handleDeleteCertificate(cert) {
    Alert.alert(
      'Delete Certificate',
      `Delete "${cert.name}"?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingCertId(cert.id);

            try {
              const { error } = await supabase
                .from('mechanic_certificates')
                .delete()
                .eq('id', cert.id);

              if (error) throw error;

              fetchCertificates(profile.id);
            } catch (error) {
              Alert.alert('Error', error.message || 'Failed to delete certificate.');
            } finally {
              setDeletingCertId(null);
            }
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={theme.primaryLight} />
      </View>
    );
  }

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={s.headerCard}>
        <View style={s.headerTop}>
          <View>
            <Text style={s.headerEyebrow}>MotoFix Account</Text>
            <Text style={s.headerTitle}>
              {firstName || lastName ? `${firstName} ${lastName}`.trim() : 'My Profile'}
            </Text>
            <Text style={s.headerSubtitle}>
              {profile?.email || 'Manage your account details'}
            </Text>
          </View>

          <View style={s.rolePill}>
            <Text style={s.rolePillText}>
              {String(profile?.role || 'customer').replace('_', ' ')}
            </Text>
          </View>
        </View>

        <View style={s.photoRow}>
          <TouchableOpacity onPress={pickPhoto} style={s.photoWrap} activeOpacity={0.85}>
            {displayPhoto ? (
              <Image source={{ uri: displayPhoto }} style={s.avatarCircle} resizeMode="cover" />
            ) : (
              <View style={[s.avatarCircle, s.avatarPlaceholder]}>
                <Text style={s.avatarInitials}>{initials}</Text>
              </View>
            )}

            <View style={s.cameraBadge}>
              <Ionicons name="camera" size={15} color="#fff" />
            </View>
          </TouchableOpacity>

          <View style={s.photoInfo}>
            <Text style={s.photoTitle}>Profile Photo</Text>
            <Text style={s.photoSubtitle}>Tap the photo to change it.</Text>

            {uploadingPhoto && (
              <View style={s.inlineLoading}>
                <ActivityIndicator size="small" color={theme.primaryLight} />
                <Text style={s.inlineLoadingText}>Uploading photo...</Text>
              </View>
            )}

            {photoUri && photoUri !== savedPhotoUrl && !uploadingPhoto && (
              <Text style={s.photoChanged}>New photo selected. Tap Save Changes.</Text>
            )}
          </View>
        </View>
      </View>

      <SectionTitle title="Account Information" />
      <View style={s.card}>
        <FieldRow
          theme={theme}
          icon="person-outline"
          label="First Name"
          value={firstName}
          onChangeText={(value) => setFirstName(cleanName(value))}
          placeholder="First name"
          maxLength={50}
        />

        <FieldRow
          theme={theme}
          icon="person-outline"
          label="Last Name"
          value={lastName}
          onChangeText={(value) => setLastName(cleanName(value))}
          placeholder="Last name"
          maxLength={50}
        />

        <FieldRow
          theme={theme}
          icon="call-outline"
          label="Phone"
          value={phone}
          onChangeText={(value) => setPhone(formatPhoneInput(value))}
          placeholder="09XXXXXXXXX"
          keyboardType="phone-pad"
          autoCapitalize="none"
          maxLength={11}
          helper="Must start with 09 and contain exactly 11 digits."
          last
        />
      </View>

      {isMechanic ? (
        <>
          <SectionTitle title="Mechanic Profile" />
          <View style={s.card}>
            <FieldRow
              theme={theme}
              icon="construct-outline"
              label="Specialization"
              value={specialization}
              onChangeText={(value) => setSpecialization(cleanSpecialization(value))}
              placeholder="e.g. Engine Repair, Electrical"
              maxLength={80}
              helper="Letters, numbers, spaces, and basic symbols only."
              last
            />
          </View>
        </>
      ) : (
        <>
          <SectionTitle title="My Motorcycle" />
          <View style={s.card}>
            <FieldRow
              theme={theme}
              icon="bicycle-outline"
              label="Make"
              value={motoMake}
              onChangeText={(value) => setMotoMake(cleanMotorcycleText(value))}
              placeholder="e.g. Yamaha"
              maxLength={60}
            />

            <FieldRow
              theme={theme}
              icon="bicycle-outline"
              label="Model"
              value={motoModel}
              onChangeText={(value) => setMotoModel(cleanMotorcycleText(value))}
              placeholder="e.g. Aerox 155"
              maxLength={60}
            />

            <FieldRow
              theme={theme}
              icon="calendar-outline"
              label="Year"
              value={motoYear}
              onChangeText={(value) => setMotoYear(cleanYear(value))}
              placeholder="e.g. 2023"
              keyboardType="number-pad"
              autoCapitalize="none"
              maxLength={4}
              helper={`Allowed year: ${MIN_MOTORCYCLE_YEAR}-${MAX_MOTORCYCLE_YEAR}.`}
              last
            />
          </View>
        </>
      )}

      <SectionTitle title="Security" />
      <View style={s.card}>
        <TouchableOpacity
          style={s.securityHeader}
          onPress={() => setShowPasswordSection((current) => !current)}
          activeOpacity={0.85}
        >
          <View style={s.securityLeft}>
            <View style={s.securityIcon}>
              <Ionicons name="lock-closed-outline" size={18} color={theme.primaryLight} />
            </View>
            <View>
              <Text style={s.securityTitle}>Change Password</Text>
              <Text style={s.securitySub}>Update your account password securely.</Text>
            </View>
          </View>

          <Ionicons
            name={showPasswordSection ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={theme.textMuted}
          />
        </TouchableOpacity>

        {showPasswordSection && (
          <View style={s.passwordBox}>
            <PasswordRow
              theme={theme}
              label="Current Password"
              value={currentPassword}
              onChangeText={(value) => setCurrentPassword(cleanPassword(value))}
              secure={!showCurrentPassword}
              onToggleSecure={() => setShowCurrentPassword((current) => !current)}
              placeholder="Enter current password"
            />

            <PasswordRow
              theme={theme}
              label="New Password"
              value={newPassword}
              onChangeText={(value) => setNewPassword(cleanPassword(value))}
              secure={!showNewPassword}
              onToggleSecure={() => setShowNewPassword((current) => !current)}
              placeholder="At least 6 characters"
            />

            <PasswordRow
              theme={theme}
              label="Confirm New Password"
              value={confirmNewPassword}
              onChangeText={(value) => setConfirmNewPassword(cleanPassword(value))}
              secure={!showConfirmPassword}
              onToggleSecure={() => setShowConfirmPassword((current) => !current)}
              placeholder="Re-enter new password"
              last
            />

            <TouchableOpacity
              style={[s.passwordButton, changingPassword && { opacity: 0.65 }]}
              onPress={handleChangePassword}
              disabled={changingPassword}
            >
              {changingPassword ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.passwordButtonText}>Change Password</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>

      <SectionTitle title="Preferences" />
      <View style={s.card}>
        <View style={s.toggleRow}>
          <View style={s.toggleLeft}>
            <View style={s.toggleIcon}>
              <Ionicons
                name={isDark ? 'moon' : 'sunny'}
                size={20}
                color={theme.primaryLight}
              />
            </View>
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

      {isMechanic && (
        <>
          <SectionTitle title="My Certificates" />
          <View style={s.card}>
            {certError ? (
              <View style={s.errorBox}>
                <Text style={s.errorText}>{certError}</Text>
              </View>
            ) : null}

            <View style={s.certUploadBox}>
              <Text style={s.certUploadTitle}>Upload New Certificate</Text>

              <TextInput
                style={s.simpleInput}
                placeholder="Certificate name, e.g. TESDA NC II"
                placeholderTextColor={theme.textMuted}
                value={certName}
                onChangeText={(value) => setCertName(cleanCertName(value))}
                maxLength={80}
              />

              <TouchableOpacity style={s.filePickerButton} onPress={pickCertFile}>
                <Ionicons
                  name="document-attach-outline"
                  size={18}
                  color={certFile ? theme.primaryLight : theme.textMuted}
                />
                <Text style={[s.filePickerText, certFile && { color: theme.primaryLight }]}>
                  {certFile ? certFile.name : 'Pick file: image or PDF'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.uploadButton, uploadingCert && { opacity: 0.65 }]}
                onPress={handleUploadCertificate}
                disabled={uploadingCert}
              >
                {uploadingCert ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={s.uploadButtonText}>+ Upload Certificate</Text>
                )}
              </TouchableOpacity>
            </View>

            {loadingCerts ? (
              <View style={s.emptyCertBox}>
                <ActivityIndicator size="small" color={theme.primaryLight} />
              </View>
            ) : certificates.length === 0 ? (
              <View style={s.emptyCertBox}>
                <Text style={s.emptyCertText}>No certificates uploaded yet.</Text>
              </View>
            ) : (
              certificates.map((certificate, index) => (
                <View
                  key={certificate.id}
                  style={[
                    s.certRow,
                    index < certificates.length - 1 && {
                      borderBottomWidth: 1,
                      borderBottomColor: theme.border,
                    },
                  ]}
                >
                  <View style={s.certIcon}>
                    <Ionicons name="document-text-outline" size={20} color={theme.primaryLight} />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={s.certName}>{certificate.name}</Text>
                    <Text style={s.certDate}>
                      Uploaded {new Date(certificate.created_at).toLocaleDateString()}
                    </Text>
                  </View>

                  <View style={s.certActions}>
                    <TouchableOpacity
                      onPress={() => Linking.openURL(certificate.file_url)}
                      style={s.viewCertBtn}
                    >
                      <Text style={s.viewCertBtnText}>View</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => handleDeleteCertificate(certificate)}
                      disabled={deletingCertId === certificate.id}
                      style={[s.deleteCertBtn, deletingCertId === certificate.id && { opacity: 0.5 }]}
                    >
                      <Text style={s.deleteCertText}>
                        {deletingCertId === certificate.id ? '...' : 'Delete'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        </>
      )}

      <TouchableOpacity
        style={[s.saveBtn, (saving || uploadingPhoto) && { opacity: 0.65 }]}
        onPress={handleSave}
        disabled={saving || uploadingPhoto}
      >
        {saving || uploadingPhoto ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={s.saveBtnText}>Save Changes</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
        <Text style={s.logoutText}>Log Out</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function SectionTitle({ title }) {
  return <Text style={sectionTitleStyles.text}>{title}</Text>;
}

const sectionTitleStyles = StyleSheet.create({
  text: {
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
  },
});

function FieldRow({
  theme,
  icon,
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  autoCapitalize = 'words',
  maxLength,
  helper,
  last,
}) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[fieldStyles.row, !last && { borderBottomColor: theme.border, borderBottomWidth: 1 }]}>
      <View style={fieldStyles.labelRow}>
        <Ionicons
          name={icon}
          size={18}
          color={focused ? theme.primaryLight : theme.textMuted}
          style={{ marginRight: 10 }}
        />
        <Text style={[fieldStyles.label, { color: focused ? theme.primaryLight : theme.textMuted }]}>
          {label}
        </Text>
      </View>

      <TextInput
        value={value}
        onChangeText={typeof onChangeText === 'function' ? onChangeText : undefined}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        maxLength={maxLength}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          fieldStyles.input,
          {
            color: theme.text,
            borderColor: focused ? theme.primary : theme.border,
            backgroundColor: theme.bg2 || theme.bg,
          },
        ]}
      />

      {helper ? (
        <Text style={[fieldStyles.helper, { color: theme.textMuted }]}>
          {helper}
        </Text>
      ) : null}
    </View>
  );
}

function PasswordRow({
  theme,
  label,
  value,
  onChangeText,
  secure,
  onToggleSecure,
  placeholder,
  last,
}) {
  return (
    <View style={[fieldStyles.row, !last && { borderBottomColor: theme.border, borderBottomWidth: 1 }]}>
      <Text style={[fieldStyles.label, { color: theme.textMuted, marginBottom: 8 }]}>
        {label}
      </Text>

      <View
        style={[
          fieldStyles.passwordInputWrap,
          {
            borderColor: theme.border,
            backgroundColor: theme.bg2 || theme.bg,
          },
        ]}
      >
        <TextInput
          value={value}
          onChangeText={typeof onChangeText === 'function' ? onChangeText : undefined}
          placeholder={placeholder}
          placeholderTextColor={theme.textMuted}
          secureTextEntry={secure}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={MAX_PASSWORD_LENGTH}
          style={[fieldStyles.passwordInput, { color: theme.text }]}
        />

        <TouchableOpacity onPress={onToggleSecure} style={fieldStyles.eyeButton}>
          <Ionicons
            name={secure ? 'eye-outline' : 'eye-off-outline'}
            size={20}
            color={theme.textMuted}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  row: {
    padding: 14,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    fontSize: 15,
    fontWeight: '700',
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  helper: {
    marginTop: 6,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
  },
  passwordInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 12,
  },
  passwordInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    paddingVertical: 11,
  },
  eyeButton: {
    paddingLeft: 10,
    paddingVertical: 8,
  },
});

const styles = (theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.bg,
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.bg,
    },
    content: {
      padding: 16,
      paddingBottom: 40,
    },

    headerCard: {
      backgroundColor: theme.card,
      borderRadius: 24,
      padding: 18,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 20,
    },
    headerTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 18,
    },
    headerEyebrow: {
      color: theme.primaryLight,
      fontSize: 11,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 5,
    },
    headerTitle: {
      color: theme.text,
      fontSize: 24,
      fontWeight: '900',
      lineHeight: 30,
    },
    headerSubtitle: {
      color: theme.textSub || theme.textMuted,
      fontSize: 12,
      fontWeight: '700',
      marginTop: 4,
    },
    rolePill: {
      backgroundColor: theme.primary + '22',
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    rolePillText: {
      color: theme.primaryLight,
      fontSize: 10,
      fontWeight: '900',
      textTransform: 'uppercase',
    },

    photoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingTop: 4,
    },
    photoWrap: {
      position: 'relative',
    },
    avatarCircle: {
      width: 84,
      height: 84,
      borderRadius: 42,
      borderWidth: 3,
      borderColor: theme.primary,
    },
    avatarPlaceholder: {
      backgroundColor: theme.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarInitials: {
      color: '#fff',
      fontSize: 24,
      fontWeight: '900',
    },
    cameraBadge: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: theme.primary,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 2,
      borderColor: theme.card,
    },
    photoInfo: {
      flex: 1,
    },
    photoTitle: {
      fontSize: 16,
      fontWeight: '900',
      color: theme.text,
      marginBottom: 4,
    },
    photoSubtitle: {
      fontSize: 12,
      color: theme.textSub || theme.textMuted,
      lineHeight: 18,
    },
    photoChanged: {
      fontSize: 11,
      color: theme.success || '#22c55e',
      marginTop: 7,
      fontWeight: '800',
    },
    inlineLoading: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 7,
      gap: 8,
    },
    inlineLoadingText: {
      color: theme.primaryLight,
      fontSize: 11,
      fontWeight: '800',
    },

    card: {
      backgroundColor: theme.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 18,
      overflow: 'hidden',
    },

    securityHeader: {
      padding: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    securityLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      gap: 12,
    },
    securityIcon: {
      width: 40,
      height: 40,
      borderRadius: 14,
      backgroundColor: theme.primary + '18',
      alignItems: 'center',
      justifyContent: 'center',
    },
    securityTitle: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '900',
    },
    securitySub: {
      color: theme.textSub || theme.textMuted,
      fontSize: 12,
      marginTop: 2,
    },
    passwordBox: {
      borderTopWidth: 1,
      borderTopColor: theme.border,
      paddingBottom: 14,
    },
    passwordButton: {
      marginHorizontal: 14,
      marginTop: 8,
      backgroundColor: theme.primary,
      borderRadius: 13,
      paddingVertical: 13,
      alignItems: 'center',
    },
    passwordButtonText: {
      color: '#fff',
      fontWeight: '900',
      fontSize: 14,
    },

    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 16,
    },
    toggleLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    toggleIcon: {
      width: 40,
      height: 40,
      borderRadius: 14,
      backgroundColor: theme.primary + '18',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    toggleLabel: {
      fontSize: 14,
      color: theme.text,
      fontWeight: '900',
    },
    toggleSub: {
      fontSize: 12,
      color: theme.textSub || theme.textMuted,
      marginTop: 2,
    },

    errorBox: {
      backgroundColor: '#ef444418',
      borderRadius: 12,
      padding: 12,
      margin: 14,
      marginBottom: 0,
    },
    errorText: {
      color: '#ef4444',
      fontSize: 13,
      fontWeight: '700',
    },
    certUploadBox: {
      padding: 14,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    certUploadTitle: {
      fontSize: 12,
      fontWeight: '900',
      color: theme.textMuted,
      marginBottom: 10,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    simpleInput: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 13,
      padding: 12,
      fontSize: 14,
      color: theme.text,
      backgroundColor: theme.bg2,
      marginBottom: 10,
      fontWeight: '700',
    },
    filePickerButton: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 13,
      padding: 12,
      marginBottom: 10,
      backgroundColor: theme.bg2,
      gap: 8,
    },
    filePickerText: {
      fontSize: 13,
      color: theme.textSub || theme.textMuted,
      fontWeight: '700',
      flex: 1,
    },
    uploadButton: {
      backgroundColor: theme.primary,
      borderRadius: 13,
      padding: 13,
      alignItems: 'center',
    },
    uploadButtonText: {
      color: '#fff',
      fontWeight: '900',
      fontSize: 14,
    },
    emptyCertBox: {
      padding: 16,
      alignItems: 'center',
    },
    emptyCertText: {
      fontSize: 13,
      color: theme.textMuted,
      fontWeight: '700',
    },
    certRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 14,
      gap: 12,
    },
    certIcon: {
      width: 38,
      height: 38,
      borderRadius: 13,
      backgroundColor: theme.primary + '16',
      alignItems: 'center',
      justifyContent: 'center',
    },
    certName: {
      fontSize: 14,
      color: theme.text,
      fontWeight: '900',
    },
    certDate: {
      fontSize: 11,
      color: theme.textMuted,
      marginTop: 3,
      fontWeight: '600',
    },
    certActions: {
      flexDirection: 'row',
      gap: 8,
      flexShrink: 0,
    },
    viewCertBtn: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 10,
      backgroundColor: theme.primary + '18',
    },
    viewCertBtnText: {
      fontSize: 12,
      color: theme.primaryLight,
      fontWeight: '900',
    },
    deleteCertBtn: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 10,
      backgroundColor: '#ef444418',
    },
    deleteCertText: {
      fontSize: 12,
      color: '#ef4444',
      fontWeight: '900',
    },

    saveBtn: {
      backgroundColor: theme.primary,
      borderRadius: 16,
      padding: 16,
      alignItems: 'center',
      marginBottom: 12,
    },
    saveBtnText: {
      color: '#fff',
      fontWeight: '900',
      fontSize: 16,
    },
    logoutBtn: {
      flexDirection: 'row',
      backgroundColor: '#DC2626',
      padding: 16,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    logoutText: {
      color: '#fff',
      fontWeight: '900',
      fontSize: 15,
    },
  });
