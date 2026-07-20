import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  RefreshControl,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';

export default function HomeScreen({ navigation }) {
  const { theme, isDark } = useTheme();
  const [user, setUser] = useState(null);
  const [services, setServices] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchData({ showLoader: true });
  }, []);

  async function fetchData({ showLoader = false } = {}) {
    if (showLoader) {
      setLoading(true);
    }

    try {
      const {
        data: { user: currentUser },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw userError;
      }

      setUser(currentUser);

      const { data: servicesData, error: servicesError } = await supabase
        .from('services')
        .select('*')
        .eq('is_active', true)
        .limit(4);

      if (servicesError) {
        throw servicesError;
      }

      setServices(servicesData || []);

      if (!currentUser?.id) {
        setBookings([]);
        return;
      }

      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select('*, services(name)')
        .eq('customer_id', currentUser.id)
        .order('created_at', { ascending: false })
        .limit(3);

      if (bookingsError) {
        throw bookingsError;
      }

      setBookings(bookingsData || []);
    } catch (error) {
      console.error('Failed to refresh home screen data:', error);
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  }

  async function handleRefresh() {
    setRefreshing(true);

    try {
      await fetchData();
    } finally {
      setRefreshing(false);
    }
  }

  const statusColor = (status) => {
    switch (status) {
      case 'confirmed':
        return theme.success;
      case 'pending':
        return theme.warning;
      case 'cancelled':
        return theme.danger;
      default:
        return theme.textMuted;
    }
  };

  const s = styles(theme);

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
      showsVerticalScrollIndicator={false}
      alwaysBounceVertical
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={theme.primaryLight}
          colors={[theme.primary]}
          progressBackgroundColor={theme.card}
        />
      }
    >
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.bg}
      />

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.greeting}>
            Hello, {user?.user_metadata?.first_name || 'Rider'} 👋
          </Text>
          <Text style={s.subGreeting}>What do you need today?</Text>
        </View>

        <View style={s.avatar}>
          <Text style={s.avatarText}>
            {(user?.user_metadata?.first_name?.[0] || 'U').toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Hero Banner */}
      <View style={s.banner}>
        <Text style={s.bannerTitle}>🏍️ Book a Service</Text>
        <Text style={s.bannerSub}>
          Fast, reliable motorcycle servicing at your fingertips
        </Text>

        <View style={s.bannerActions}>
          <TouchableOpacity
            style={s.bannerButton}
            onPress={() => navigation.navigate('Booking')}
          >
            <Text style={s.bannerButtonText}>Book Now →</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.bannerButton}
            onPress={() => navigation.navigate('PreAssessment')}
          >
            <Text style={s.bannerButtonText}>Get Estimate →</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Quick Access */}
      <Text style={s.sectionTitle}>Quick Access</Text>
      <View style={s.quickGrid}>
        <TouchableOpacity
          style={s.quickCard}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('Mechanics')}
        >
          <Text style={s.quickIcon}>👨‍🔧</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.quickTitle}>View Mechanics</Text>
            <Text style={s.quickSub}>
              Browse mechanic profiles, specializations, reviews, and certificates.
            </Text>
          </View>
          <Text style={s.quickArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Recent Bookings */}
      <Text style={s.sectionTitle}>Recent Bookings</Text>

      {bookings.length === 0 ? (
        <View style={s.emptyCard}>
          <Text style={s.emptyText}>No bookings yet. Book your first service!</Text>
        </View>
      ) : (
        bookings.map((b) => (
          <View key={b.id} style={s.bookingCard}>
            <View>
              <Text style={s.bookingService}>{b.services?.name || 'Service'}</Text>
              <Text style={s.bookingDate}>
                {b.booking_date || new Date(b.created_at).toDateString()}
              </Text>
            </View>

            <View
              style={[
                s.statusBadge,
                { backgroundColor: statusColor(b.status) + '22' },
              ]}
            >
              <Text style={[s.statusText, { color: statusColor(b.status) }]}>
                {b.status || 'pending'}
              </Text>
            </View>
          </View>
        ))
      )}

      {/* Services */}
      <Text style={s.sectionTitle}>Our Services</Text>

      <View style={s.servicesGrid}>
        {services.length === 0 ? (
          <Text style={s.emptyText}>No services available.</Text>
        ) : (
          services.map((sv) => (
            <TouchableOpacity
              key={sv.id}
              style={s.serviceCard}
              onPress={() =>
                navigation.navigate('Booking', { preselectedService: sv })
              }
            >
              <Text style={s.serviceIcon}>🔧</Text>
              <Text style={s.serviceName}>{sv.name}</Text>
              <Text style={s.serviceDesc}>{sv.description}</Text>
              <Text style={s.servicePrice}>₱{sv.base_price}</Text>
            </TouchableOpacity>
          ))
        )}
      </View>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

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
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 24,
      paddingTop: 48,
    },
    greeting: {
      fontSize: 22,
      fontWeight: 'bold',
      color: theme.text,
    },
    subGreeting: {
      fontSize: 13,
      color: theme.textSub,
      marginTop: 2,
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: theme.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarText: {
      color: '#fff',
      fontWeight: 'bold',
      fontSize: 18,
    },
    banner: {
      margin: 16,
      borderRadius: 16,
      backgroundColor: theme.bg2,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 24,
    },
    bannerTitle: {
      fontSize: 22,
      fontWeight: 'bold',
      color: theme.primaryLight,
      marginBottom: 8,
    },
    bannerSub: {
      fontSize: 13,
      color: theme.textSub,
      marginBottom: 16,
    },
    bannerActions: {
      flexDirection: 'row',
      gap: 10,
      flexWrap: 'wrap',
    },
    bannerButton: {
      backgroundColor: theme.primary,
      borderRadius: 10,
      padding: 12,
      alignSelf: 'flex-start',
    },
    bannerButtonText: {
      color: '#fff',
      fontWeight: 'bold',
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: theme.text,
      paddingHorizontal: 16,
      marginTop: 8,
      marginBottom: 12,
    },
    quickGrid: {
      paddingHorizontal: 16,
      marginBottom: 8,
    },
    quickCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 16,
      padding: 16,
    },
    quickIcon: {
      fontSize: 30,
    },
    quickTitle: {
      color: theme.text,
      fontSize: 15,
      fontWeight: '800',
    },
    quickSub: {
      color: theme.textMuted,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 3,
    },
    quickArrow: {
      color: theme.primaryLight,
      fontSize: 28,
      fontWeight: 'bold',
      marginLeft: 4,
    },
    bookingCard: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: theme.card,
      marginHorizontal: 16,
      marginBottom: 10,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.border,
    },
    bookingService: {
      color: theme.text,
      fontWeight: '600',
      fontSize: 15,
    },
    bookingDate: {
      color: theme.textSub,
      fontSize: 12,
      marginTop: 4,
    },
    statusBadge: {
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    statusText: {
      fontSize: 12,
      fontWeight: 'bold',
      textTransform: 'capitalize',
    },
    emptyCard: {
      backgroundColor: theme.bg2,
      marginHorizontal: 16,
      borderRadius: 12,
      padding: 20,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.border,
    },
    emptyText: {
      color: theme.textMuted,
      fontSize: 13,
    },
    servicesGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: 12,
    },
    serviceCard: {
      width: '46%',
      backgroundColor: theme.card,
      borderRadius: 12,
      padding: 16,
      margin: '2%',
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
    },
    serviceIcon: {
      fontSize: 28,
      marginBottom: 8,
    },
    serviceName: {
      color: theme.text,
      fontWeight: '600',
      fontSize: 14,
      textAlign: 'center',
    },
    serviceDesc: {
      color: theme.textMuted,
      fontSize: 11,
      textAlign: 'center',
      marginTop: 2,
    },
    servicePrice: {
      color: theme.primaryLight,
      fontSize: 13,
      marginTop: 4,
      fontWeight: 'bold',
    },
  });
