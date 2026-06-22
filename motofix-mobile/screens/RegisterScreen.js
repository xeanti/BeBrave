import { useState } from 'react';
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
} from 'react-native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/ThemeContext';

// ─── Terms Content ────────────────────────────────────────────────────────────
const TERMS_SECTIONS = [
  {
    title: '1. Acceptance of Terms',
    body: 'By registering, you agree to be bound by these Terms and Conditions.',
  },
  {
    title: '2. Services',
    body: 'MotoFix provides motorcycle service booking, parts ordering, and AI appearance preview services. All bookings are subject to shop availability and confirmation.',
  },
  {
    title: '3. Down Payments',
    body: 'A 15% down payment is required to confirm bookings and parts orders. This is non-refundable if cancelled within 24 hours of the appointment.',
  },
  {
    title: '4. User Responsibilities',
    body: 'You are responsible for providing accurate information. Misuse of the platform may result in account suspension.',
  },
  {
    title: '5. Limitation of Liability',
    body: 'MotoFix is not liable for delays, damages, or losses arising from service appointments beyond our reasonable control.',
  },
  {
    title: '6. Changes to Terms',
    body: 'We reserve the right to update these terms at any time. Continued use of the platform constitutes acceptance.',
  },
];

const DPA_SECTIONS = [
  {
    title: 'Data Controller',
    body: 'MotoFix collects and processes your personal data as the data controller under RA 10173 (Data Privacy Act of 2012).',
  },
  {
    title: 'Data Collected',
    body: 'We collect your name, email address, phone number, and motorcycle details for the purpose of service booking, parts ordering, and account management.',
  },
  {
    title: 'Purpose of Processing',
    body: 'Your data is used to manage your bookings, process orders, send service reminders, and improve our services.',
  },
  {
    title: 'Data Sharing',
    body: 'Your information may be shared with assigned mechanics solely for service fulfillment. We do not sell your data to third parties.',
  },
  {
    title: 'Retention',
    body: 'Personal data is retained for the duration of your account and up to 3 years after account closure for legal compliance.',
  },
  {
    title: 'Your Rights',
    body: 'Under RA 10173, you have the right to access, correct, and request deletion of your personal data. Contact us to exercise these rights.',
  },
];

// ─── Reusable Info Modal ──────────────────────────────────────────────────────
function InfoModal({ visible, onClose, title, sections, theme }) {
  const s = modalStyles(theme);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={s.backdrop}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity activeOpacity={1} style={s.sheet}>
          {/* Header */}
          <View style={s.header}>
            <Text style={s.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={s.closeIcon}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.body}
          >
            {sections.map((sec, i) => (
              <View key={i} style={s.section}>
                <Text style={s.sectionTitle}>{sec.title}</Text>
                <Text style={s.sectionBody}>{sec.body}</Text>
              </View>
            ))}
          </ScrollView>

          {/* Close Button */}
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
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showDPA, setShowDPA] = useState(false);

  async function handleRegister() {
    if (!firstName || !lastName || !email || !password || !confirm) {
      Alert.alert('Error', 'Please fill in all fields.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Error', 'Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters.');
      return;
    }
    if (!agreedToTerms) {
      Alert.alert(
        'Agreement Required',
        'You must agree to the Terms and Conditions and Data Privacy consent before registering.'
      );
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
          phone,
          role: 'customer',
        },
      },
    });

    setLoading(false);

    if (error) {
      Alert.alert('Registration Failed', error.message);
    } else {
      Alert.alert(
        'Success!',
        'Account created. Please check your email to verify.',
        [{ text: 'OK', onPress: () => navigation.replace('Login') }]
      );
    }
  }

  const s = styles(theme);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={s.container}
    >
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.bg}
      />

      <ScrollView
        contentContainerStyle={s.inner}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.logo}>🏍️ MotoFix</Text>
        <Text style={s.tagline}>Create your account</Text>

        <TextInput
          style={s.input}
          placeholder="First Name"
          placeholderTextColor={theme.textMuted}
          value={firstName}
          onChangeText={setFirstName}
        />
        <TextInput
          style={s.input}
          placeholder="Last Name"
          placeholderTextColor={theme.textMuted}
          value={lastName}
          onChangeText={setLastName}
        />
        <TextInput
          style={s.input}
          placeholder="Email"
          placeholderTextColor={theme.textMuted}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextInput
          style={s.input}
          placeholder="Phone Number (09XX XXX XXXX)"
          placeholderTextColor={theme.textMuted}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />
        <TextInput
          style={s.input}
          placeholder="Password"
          placeholderTextColor={theme.textMuted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <TextInput
          style={s.input}
          placeholder="Confirm Password"
          placeholderTextColor={theme.textMuted}
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
        />

        {/* ── Terms & DPA Consent Box ── */}
        <View style={s.consentBox}>
          <TouchableOpacity
            style={s.checkRow}
            onPress={() => setAgreedToTerms((v) => !v)}
            activeOpacity={0.7}
          >
            <View style={[s.checkbox, agreedToTerms && s.checkboxChecked]}>
              {agreedToTerms && <Text style={s.checkmark}>✓</Text>}
            </View>

            <Text style={s.consentText}>
              {'I have read and agree to the '}
              <Text
                style={s.consentLink}
                onPress={() => setShowTerms(true)}
              >
                Terms and Conditions
              </Text>
              {' and consent to the collection and processing of my personal data in accordance with the '}
              <Text
                style={s.consentLink}
                onPress={() => setShowDPA(true)}
              >
                Data Privacy Act of 2012 (RA 10173)
              </Text>
              {'.'}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[s.button, (!agreedToTerms || loading) && s.buttonDisabled]}
          onPress={handleRegister}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={s.buttonText}>Create Account</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.replace('Login')}>
          <Text style={s.link}>
            Already have an account?{' '}
            <Text style={s.linkBold}>Log In</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ── Modals ── */}
      <InfoModal
        visible={showTerms}
        onClose={() => setShowTerms(false)}
        title="Terms and Conditions"
        sections={TERMS_SECTIONS}
        theme={theme}
      />
      <InfoModal
        visible={showDPA}
        onClose={() => setShowDPA(false)}
        title="Data Privacy Consent"
        sections={DPA_SECTIONS}
        theme={theme}
      />
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = (theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.bg,
    },
    inner: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: 32,
      paddingVertical: 48,
    },
    logo: {
      fontSize: 38,
      fontWeight: 'bold',
      color: theme.primaryLight,
      textAlign: 'center',
      marginBottom: 8,
    },
    tagline: {
      fontSize: 14,
      color: theme.textSub,
      textAlign: 'center',
      marginBottom: 40,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      padding: 14,
      marginBottom: 16,
      fontSize: 16,
      backgroundColor: theme.bg2,
      color: theme.text,
    },

    // Consent box
    consentBox: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      padding: 14,
      marginBottom: 20,
      backgroundColor: theme.bg2,
    },
    checkRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: 4,
      borderWidth: 1.5,
      borderColor: theme.border,
      marginTop: 1,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    checkboxChecked: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    checkmark: {
      color: '#fff',
      fontSize: 12,
      fontWeight: 'bold',
      lineHeight: 14,
    },
    consentText: {
      flex: 1,
      fontSize: 13,
      color: theme.textSub,
      lineHeight: 20,
    },
    consentLink: {
      color: theme.primaryLight,
      fontWeight: '500',
    },

    button: {
      backgroundColor: theme.primary,
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
      marginBottom: 20,
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    buttonText: {
      color: '#fff',
      fontWeight: 'bold',
      fontSize: 16,
    },
    link: {
      color: theme.textSub,
      textAlign: 'center',
      fontSize: 14,
    },
    linkBold: {
      color: theme.primaryLight,
      fontWeight: 'bold',
    },
  });

const modalStyles = (theme) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.75)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 20,
    },
    sheet: {
      backgroundColor: theme.bg2,
      borderRadius: 20,
      width: '100%',
      maxHeight: '80%',
      borderWidth: 1,
      borderColor: theme.border,
      overflow: 'hidden',
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    modalTitle: {
      fontSize: 17,
      fontWeight: 'bold',
      color: theme.text,
    },
    closeIcon: {
      fontSize: 18,
      color: theme.textMuted,
    },
    body: {
      paddingHorizontal: 20,
      paddingVertical: 16,
      gap: 16,
    },
    section: {
      gap: 4,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.text,
      marginBottom: 2,
    },
    sectionBody: {
      fontSize: 13,
      color: theme.textSub,
      lineHeight: 20,
    },
    closeBtn: {
      margin: 16,
      backgroundColor: theme.primary,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
    },
    closeBtnText: {
      color: '#fff',
      fontWeight: '600',
      fontSize: 14,
    },
  });