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
} from 'react-native';
import { CommonActions } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/ThemeContext';

export default function LoginScreen({ navigation }) {
  const { theme, isDark } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef(null);

  function resetToScreen(screenName) {
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: screenName }],
      })
    );
  }

  async function handleLogin() {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password) {
      Alert.alert('Error', 'Please enter your email and password.');
      return;
    }

    setLoading(true);

    try {
      // Clear old/stuck session before logging in again
      await supabase.auth.signOut();

      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (loginError) {
        Alert.alert('Login Failed', loginError.message);
        return;
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error(userError?.message || 'Could not retrieve user data.');
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profileError) {
        await supabase.auth.signOut();
        throw new Error(profileError.message);
      }

      if (!profile) {
        await supabase.auth.signOut();
        throw new Error('No profile found for this account.');
      }

      const role = profile.role || 'customer';

      if (role === 'admin') {
        resetToScreen('AdminMain');
      } else if (role === 'mechanic') {
        resetToScreen('MechanicMain');
      } else if (role === 'staff') {
        resetToScreen('StaffMain');
      } else {
        resetToScreen('Main');
      }
    } catch (error) {
      Alert.alert('Login Error', error.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  const s = styles(theme);

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.bg}
      />

      <ScrollView
        contentContainerStyle={s.inner}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={s.logoBlock}>
          <View style={s.logoIconWrap}>
            <Text style={s.logoIcon}>🏍️</Text>
          </View>
          <Text style={s.logoText}>MotoFix</Text>
          <Text style={s.tagline}>Your motorcycle service partner</Text>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Welcome back</Text>

          <Text style={s.label}>Email</Text>
          <TextInput
            style={s.input}
            placeholder="you@example.com"
            placeholderTextColor={theme.textMuted}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            blurOnSubmit={false}
            editable={!loading}
          />

          <Text style={s.label}>Password</Text>
          <TextInput
            ref={passwordRef}
            style={s.input}
            placeholder="••••••••"
            placeholderTextColor={theme.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleLogin}
            editable={!loading}
          />

          <TouchableOpacity
            style={[s.button, loading && s.buttonLoading]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.buttonText}>Log In</Text>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={s.signupRow}
          onPress={() => navigation.navigate('Register')}
          disabled={loading}
        >
          <Text style={s.signupText}>Don't have an account? </Text>
          <Text style={s.signupLink}>Sign Up</Text>
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
      paddingHorizontal: 24,
      paddingVertical: 48,
    },

    logoBlock: {
      alignItems: 'center',
      marginBottom: 32,
    },
    logoIconWrap: {
      width: 72,
      height: 72,
      borderRadius: 20,
      backgroundColor: theme.primary + '20',
      borderWidth: 1,
      borderColor: theme.primary + '40',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 14,
    },
    logoIcon: {
      fontSize: 36,
    },
    logoText: {
      fontSize: 28,
      fontWeight: '800',
      color: theme.primaryLight,
      letterSpacing: -0.5,
      marginBottom: 4,
    },
    tagline: {
      fontSize: 13,
      color: theme.textMuted,
    },

    card: {
      backgroundColor: theme.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 24,
      marginBottom: 20,
    },
    cardTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.text,
      marginBottom: 20,
    },
    label: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.textSub,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: 6,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 13,
      marginBottom: 16,
      fontSize: 15,
      backgroundColor: theme.bg2,
      color: theme.text,
    },
    button: {
      backgroundColor: theme.primary,
      borderRadius: 12,
      paddingVertical: 15,
      alignItems: 'center',
      marginTop: 4,
    },
    buttonLoading: {
      opacity: 0.7,
    },
    buttonText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 16,
    },

    signupRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
    },
    signupText: {
      fontSize: 14,
      color: theme.textSub,
    },
    signupLink: {
      fontSize: 14,
      color: theme.primaryLight,
      fontWeight: '700',
    },
  });