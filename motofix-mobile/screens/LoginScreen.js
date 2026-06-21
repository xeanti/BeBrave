import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, StatusBar, Alert, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/ThemeContext';

export default function LoginScreen({ navigation }) {
  const { theme, isDark } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email || !password) { 
      Alert.alert('Error', 'Please enter your email and password.'); 
      return; 
    }
    
    setLoading(true);
    
    // 1. Sign in the user with password
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (error) { 
      setLoading(false);
      Alert.alert('Login Failed', error.message); 
      return;
    }
    
    try {
      // 2. Fetch the authenticated user's metadata to verify their system role
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        throw new Error(userError?.message || 'Could not retrieve user data.');
      }

      const role = user?.user_metadata?.role || 'customer';

      // 3. Route the user to their designated dashboard layout
      if (role === 'admin') {
        navigation.replace('AdminMain');
      } else if (role === 'mechanic') {
        navigation.replace('MechanicMain');
      } else if (role === 'staff') {
        navigation.replace('StaffMain');
      } else {
        navigation.replace('Main'); // Default route for customers
      }
    } catch (routeError) {
      Alert.alert('Routing Error', routeError.message);
    } finally {
      setLoading(false);
    }
  }

  const s = styles(theme);
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.bg} />
      <View style={s.inner}>
        <Text style={s.logo}>🏍️ MotoFix</Text>
        <Text style={s.tagline}>Your motorcycle service partner</Text>
        <TextInput style={s.input} placeholder="Email" placeholderTextColor={theme.textMuted}
          value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <TextInput style={s.input} placeholder="Password" placeholderTextColor={theme.textMuted}
          value={password} onChangeText={setPassword} secureTextEntry />
        <TouchableOpacity style={s.button} onPress={handleLogin} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Log In</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('Register')}>
          <Text style={s.link}>Don't have an account? <Text style={s.linkBold}>Sign Up</Text></Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 32 },
  logo: { fontSize: 38, fontWeight: 'bold', color: theme.primaryLight, textAlign: 'center', marginBottom: 8 },
  tagline: { fontSize: 14, color: theme.textSub, textAlign: 'center', marginBottom: 48 },
  input: { borderWidth: 1, borderColor: theme.border, borderRadius: 12, padding: 14, marginBottom: 16, fontSize: 16, backgroundColor: theme.bg2, color: theme.text },
  button: { backgroundColor: theme.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 20 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  link: { color: theme.textSub, textAlign: 'center', fontSize: 14 },
  linkBold: { color: theme.primaryLight, fontWeight: 'bold' },
});