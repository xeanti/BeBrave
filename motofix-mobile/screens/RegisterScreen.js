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
} from 'react-native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/ThemeContext';

export default function RegisterScreen({ navigation }) {
  const { theme, isDark } = useTheme();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

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

    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
          phone,
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
        [
          {
            text: 'OK',
            onPress: () => navigation.replace('Login'),
          },
        ]
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
          placeholder="Phone Number"
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

        <TouchableOpacity
          style={s.button}
          onPress={handleRegister}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={s.buttonText}>Create Account</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigation.replace('Login')}
        >
          <Text style={s.link}>
            Already have an account?{' '}
            <Text style={s.linkBold}>Log In</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

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

    button: {
      backgroundColor: theme.primary,
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
      marginBottom: 20,
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