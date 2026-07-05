import { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Alert,
  ActivityIndicator,
  ScrollView,
  Modal,
  Image,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/ThemeContext';

const APP_ICON = require('../assets/favicon.png');

// ─── Terms Content ────────────────────────────────────────────────────────────
const TERMS_SECTIONS = [
  { title: '1. Acceptance of Terms', body: 'By registering, you agree to be bound by these Terms and Conditions.' },
  { title: '2. Services', body: 'MotoFix provides motorcycle service booking, parts ordering, and AI appearance preview services. All bookings are subject to shop availability and confirmation.' },
  { title: '3. Down Payments', body: 'A 15% down payment is required to confirm bookings and parts orders. This is non-refundable if cancelled within 24 hours of the appointment.' },
  { title: '4. User Responsibilities', body: 'You are responsible for providing accurate information. Misuse of the platform may result in account suspension.' },
  { title: '5. Limitation of Liability', body: 'MotoFix is not liable for delays, damages, or losses arising from service appointments beyond our reasonable control.' },
  { title: '6. Changes to Terms', body: 'We reserve the right to update these terms at any time. Continued use of the platform constitutes acceptance.' },
];

const DPA_SECTIONS = [
  { title: 'Data Controller', body: 'MotoFix collects and processes your personal data as the data controller under RA 10173 (Data Privacy Act of 2012).' },
  { title: 'Data Collected', body: 'We collect your name, email address, phone number, and motorcycle details for the purpose of service booking, parts ordering, and account management.' },
  { title: 'Purpose of Processing', body: 'Your data is used to manage your bookings, process orders, send service reminders, and improve our services.' },
  { title: 'Data Sharing', body: 'Your information may be shared with assigned mechanics solely for service fulfillment. We do not sell your data to third parties.' },
  { title: 'Retention', body: 'Personal data is retained for the duration of your account and up to 3 years after account closure for legal compliance.' },
  { title: 'Your Rights', body: 'Under RA 10173, you have the right to access, correct, and request deletion of your personal data. Contact us to exercise these rights.' },
];

// ─── Password Strength Logic ──────────────────────────────────────────────────
function getPasswordStrength(password) {
  if (!password) return { score: 0, label: '', color: null, hint: '' };

  const checks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };

  const missing = [];
  if (!checks.length) missing.push('8+ chars');
  if (!checks.uppercase) missing.push('uppercase');
  if (!checks.lowercase) missing.push('lowercase');
  if (!checks.number) missing.push('number');
  if (!checks.special) missing.push('special char');

  const passed = Object.values(checks).filter(Boolean).length;
  const hint = missing.length ? `Missing: ${missing.join(', ')}` : 'Password looks great!';

  if (passed <= 2) return { score: 1, label: 'Weak', color: '#ef4444', hint };
  if (passed === 3) return { score: 2, label: 'Fair', color: '#eab308', hint };
  if (passed === 4) return { score: 3, label: 'Strong', color: '#3b82f6', hint };
  return { score: 4, label: 'Very Strong', color: '#22c55e', hint };
}

function validatePassword(password) {
  const errors = [];
  if (password.length < 8) errors.push('at least 8 characters');
  if (!/[A-Z]/.test(password)) errors.push('an uppercase letter');
  if (!/[a-z]/.test(password)) errors.push('a lowercase letter');
  if (!/[0-9]/.test(password)) errors.push('a number');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('a special character');
  return errors;
}

const PHONE_PREFIX = '09';

function formatPhoneInput(value) {
  const digits = value.replace(/\D/g, '');

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


// ─── Reusable Info Modal ──────────────────────────────────────────────────────
function InfoModal({ visible, onClose, title, sections, theme }) {
  const s = modalStyles(theme);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={s.sheet}>
          <View style={s.header}>
            <Text style={s.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={s.closeIcon}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.body}>
            {sections.map((sec, i) => (
              <View key={i} style={s.section}>
                <Text style={s.sectionTitle}>{sec.title}</Text>
                <Text style={s.sectionBody}>{sec.body}</Text>
              </View>
            ))}
          </ScrollView>
          <TouchableOpacity style={s.closeBtn} onPress={onClose}>
            <Text style={s.closeBtnText}>Close</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Register Screen ──────────────────────────────────────────────────────────
export default function RegisterScreen({ navigation }) {
  const { theme, isDark } = useTheme();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState(PHONE_PREFIX);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showDPA, setShowDPA] = useState(false);

  const lastNameRef = useRef(null);
  const emailRef = useRef(null);
  const phoneRef = useRef(null);
  const passwordRef = useRef(null);
  const confirmRef = useRef(null);

  const strength = getPasswordStrength(password);
  const passwordsMatch = confirm.length > 0 && password === confirm;
  const passwordsMismatch = confirm.length > 0 && password !== confirm;

  async function handleRegister() {
    const cleanPhone = formatPhoneInput(phone);

    if (!firstName || !lastName || !email || !password || !confirm) {
      Alert.alert('Error', 'Please fill in all required fields.');
      return;
    }

    if (!isValidPhilippineMobile(cleanPhone)) {
      Alert.alert(
        'Invalid Phone Number',
        'Phone number must start with 09 and contain exactly 11 digits.'
      );
      return;
    }

    const pwErrors = validatePassword(password);
    if (pwErrors.length) {
      Alert.alert('Weak Password', `Password must contain ${pwErrors.join(', ')}.`);
      return;
    }
    if (password !== confirm) {
      Alert.alert('Error', 'Passwords do not match.');
      return;
    }
    if (!agreedToTerms) {
      Alert.alert('Agreement Required', 'You must agree to the Terms and Conditions and Data Privacy consent before registering.');
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: 'https://motofix.store/auth/callback',
        data: {
          first_name: firstName,
          last_name: lastName,
          phone: cleanPhone,
          role: 'customer',
        },
      },
    });

    await supabase.auth.signOut();
    setLoading(false);

    if (error) {
      Alert.alert('Registration Failed', error.message);
    } else {
      Alert.alert('Success!', 'Account created. Please check your email to verify.', [
        { text: 'OK', onPress: () => navigation.replace('Login') },
      ]);
    }
  }

  const s = styles(theme);

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.bg} />

      <ScrollView
        contentContainerStyle={s.inner}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Logo */}
        <View style={s.logoBlock}>
          <View style={s.logoIconWrap}>
            <Image source={APP_ICON} style={s.logoImage} resizeMode="contain" />
          </View>
          <Text style={s.logoText}>MotoFix</Text>
          <Text style={s.tagline}>Create your account</Text>
        </View>

        {/* Form card */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Get started</Text>

          {/* Name row */}
          <View style={s.row}>
            <View style={[s.fieldWrap, { flex: 1, marginRight: 8 }]}>
              <Text style={s.label}>First Name</Text>
              <TextInput
                style={s.input}
                placeholder="Juan"
                placeholderTextColor={theme.textMuted}
                value={firstName}
                onChangeText={setFirstName}
                returnKeyType="next"
                onSubmitEditing={() => lastNameRef.current?.focus()}
                blurOnSubmit={false}
              />
            </View>
            <View style={[s.fieldWrap, { flex: 1 }]}>
              <Text style={s.label}>Last Name</Text>
              <TextInput
                ref={lastNameRef}
                style={s.input}
                placeholder="dela Cruz"
                placeholderTextColor={theme.textMuted}
                value={lastName}
                onChangeText={setLastName}
                returnKeyType="next"
                onSubmitEditing={() => emailRef.current?.focus()}
                blurOnSubmit={false}
              />
            </View>
          </View>

          <View style={s.fieldWrap}>
            <Text style={s.label}>Email</Text>
            <TextInput
              ref={emailRef}
              style={s.input}
              placeholder="you@example.com"
              placeholderTextColor={theme.textMuted}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => phoneRef.current?.focus()}
              blurOnSubmit={false}
            />
          </View>

          <View style={s.fieldWrap}>
            <Text style={s.label}>Phone</Text>
            <TextInput
              ref={phoneRef}
              style={s.input}
              placeholder="09XX XXX XXXX"
              placeholderTextColor={theme.textMuted}
              value={phone}
              onChangeText={(value) => setPhone(formatPhoneInput(value))}
              keyboardType="phone-pad"
              maxLength={11}
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              blurOnSubmit={false}
            />
          </View>

          <View style={s.divider} />

          {/* Password field */}
          <View style={s.fieldWrap}>
            <View style={s.labelRow}>
              <Text style={s.label}>Password</Text>
              <TouchableOpacity onPress={() => setShowPassword((v) => !v)}>
                <Text style={[s.toggleText, { color: theme.primaryLight }]}>
                  {showPassword ? 'Hide' : 'Show'}
                </Text>
              </TouchableOpacity>
            </View>
            <TextInput
              ref={passwordRef}
              style={s.input}
              placeholder="8+ chars, A-Z, 0-9, symbol"
              placeholderTextColor={theme.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              returnKeyType="next"
              onSubmitEditing={() => confirmRef.current?.focus()}
              blurOnSubmit={false}
            />
            {/* Strength bar */}
            {password.length > 0 && (
              <View style={s.strengthWrap}>
                <View style={s.strengthBar}>
                  {[1, 2, 3, 4].map((i) => (
                    <View
                      key={i}
                      style={[
                        s.strengthSegment,
                        { backgroundColor: i <= strength.score ? strength.color : theme.border },
                      ]}
                    />
                  ))}
                </View>
                <View style={s.strengthMeta}>
                  <Text style={s.strengthHint} numberOfLines={1}>{strength.hint}</Text>
                  <Text style={[s.strengthLabel, { color: strength.color }]}>{strength.label}</Text>
                </View>
              </View>
            )}
            {!password.length && (
              <Text style={s.fieldHint}>8+ chars · uppercase · lowercase · number · special character</Text>
            )}
          </View>

          {/* Confirm password field */}
          <View style={s.fieldWrap}>
            <View style={s.labelRow}>
              <Text style={s.label}>Confirm Password</Text>
              <TouchableOpacity onPress={() => setShowConfirm((v) => !v)}>
                <Text style={[s.toggleText, { color: theme.primaryLight }]}>
                  {showConfirm ? 'Hide' : 'Show'}
                </Text>
              </TouchableOpacity>
            </View>
            <TextInput
              ref={confirmRef}
              style={[
                s.input,
                passwordsMatch && { borderColor: '#22c55e' },
                passwordsMismatch && { borderColor: '#ef4444' },
              ]}
              placeholder="Re-enter password"
              placeholderTextColor={theme.textMuted}
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry={!showConfirm}
              returnKeyType="done"
              onSubmitEditing={handleRegister}
            />
            {passwordsMatch && (
              <Text style={[s.fieldHint, { color: '#22c55e' }]}>✓ Passwords match</Text>
            )}
            {passwordsMismatch && (
              <Text style={[s.fieldHint, { color: '#ef4444' }]}>Passwords do not match</Text>
            )}
          </View>

          {/* Consent box */}
          <TouchableOpacity
            style={s.consentBox}
            onPress={() => setAgreedToTerms((v) => !v)}
            activeOpacity={0.7}
          >
            <View style={[s.checkbox, agreedToTerms && s.checkboxChecked]}>
              {agreedToTerms && <Text style={s.checkmark}>✓</Text>}
            </View>
            <Text style={s.consentText}>
              {'I agree to the '}
              <Text style={s.consentLink} onPress={() => setShowTerms(true)}>
                Terms and Conditions
              </Text>
              {' and '}
              <Text style={s.consentLink} onPress={() => setShowDPA(true)}>
                Data Privacy Act (RA 10173)
              </Text>
              {'.'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.button, (!agreedToTerms || loading) && s.buttonDisabled]}
            onPress={handleRegister}
            disabled={loading || !agreedToTerms}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.buttonText}>Create Account</Text>
            }
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={s.loginRow} onPress={() => navigation.replace('Login')}>
          <Text style={s.loginText}>Already have an account? </Text>
          <Text style={s.loginLink}>Log In</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      <InfoModal visible={showTerms} onClose={() => setShowTerms(false)} title="Terms and Conditions" sections={TERMS_SECTIONS} theme={theme} />
      <InfoModal visible={showDPA} onClose={() => setShowDPA(false)} title="Data Privacy Consent" sections={DPA_SECTIONS} theme={theme} />
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  inner: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 48 },

  logoBlock: { alignItems: 'center', marginBottom: 28 },
  logoIconWrap: {
    width: 68, height: 68, borderRadius: 18,
    backgroundColor: theme.primary + '20',
    borderWidth: 1, borderColor: theme.primary + '40',
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  logoImage: {
    width: 52,
    height: 52,
    borderRadius: 12,
  },
  logoText: { fontSize: 26, fontWeight: '800', color: theme.primaryLight, letterSpacing: -0.5, marginBottom: 4 },
  tagline: { fontSize: 13, color: theme.textMuted },

  card: {
    backgroundColor: theme.card, borderRadius: 20,
    borderWidth: 1, borderColor: theme.border, padding: 24, marginBottom: 20,
  },
  cardTitle: { fontSize: 18, fontWeight: '700', color: theme.text, marginBottom: 20 },

  row: { flexDirection: 'row' },
  fieldWrap: { marginBottom: 14 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  label: {
    fontSize: 11, fontWeight: '700', color: theme.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 6,
  },
  labelOptional: { fontWeight: '400', textTransform: 'none', fontSize: 11, color: theme.textMuted },
  toggleText: { fontSize: 11, fontWeight: '700' },
  input: {
    borderWidth: 1, borderColor: theme.border, borderRadius: 11,
    paddingHorizontal: 13, paddingVertical: 12,
    fontSize: 15, backgroundColor: theme.bg2, color: theme.text,
  },
  fieldHint: { marginTop: 5, fontSize: 11, color: theme.textMuted, lineHeight: 15 },

  divider: { height: 1, backgroundColor: theme.border, marginVertical: 16 },

  // Strength bar
  strengthWrap: { marginTop: 8, gap: 6 },
  strengthBar: { flexDirection: 'row', gap: 4 },
  strengthSegment: { flex: 1, height: 4, borderRadius: 2 },
  strengthMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  strengthHint: { fontSize: 11, color: theme.textMuted, flex: 1, marginRight: 8 },
  strengthLabel: { fontSize: 11, fontWeight: '700', flexShrink: 0 },

  consentBox: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: theme.bg2, borderRadius: 12,
    borderWidth: 1, borderColor: theme.border,
    padding: 12, marginBottom: 16, gap: 10,
  },
  checkbox: {
    width: 20, height: 20, borderRadius: 5,
    borderWidth: 1.5, borderColor: theme.border,
    marginTop: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  checkboxChecked: { backgroundColor: theme.primary, borderColor: theme.primary },
  checkmark: { color: '#fff', fontSize: 11, fontWeight: 'bold', lineHeight: 14 },
  consentText: { flex: 1, fontSize: 12, color: theme.textSub, lineHeight: 19 },
  consentLink: { color: theme.primaryLight, fontWeight: '600' },

  button: { backgroundColor: theme.primary, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  loginRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  loginText: { fontSize: 14, color: theme.textSub },
  loginLink: { fontSize: 14, color: theme.primaryLight, fontWeight: '700' },
});

// ─── Modal Styles ─────────────────────────────────────────────────────────────
const modalStyles = (theme) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  sheet: { backgroundColor: theme.bg2, borderRadius: 20, width: '100%', maxHeight: '80%', borderWidth: 1, borderColor: theme.border, overflow: 'hidden' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: theme.border },
  modalTitle: { fontSize: 17, fontWeight: 'bold', color: theme.text },
  closeIcon: { fontSize: 18, color: theme.textMuted },
  body: { paddingHorizontal: 20, paddingVertical: 16, gap: 16 },
  section: { gap: 4 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: theme.text, marginBottom: 2 },
  sectionBody: { fontSize: 13, color: theme.textSub, lineHeight: 20 },
  closeBtn: { margin: 16, backgroundColor: theme.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  closeBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});