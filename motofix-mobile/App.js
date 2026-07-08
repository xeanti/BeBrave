import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { createStackNavigator } from '@react-navigation/stack';
import { NavigationContainer } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { ThemeProvider, useTheme } from './lib/ThemeContext';
import { CartProvider, useCart } from './lib/CartContext';
import RoleGuard from './lib/RoleGuard';
import { supabase } from './lib/supabase';
import {
  registerForPushNotifications,
  addNotificationListeners,
} from './lib/pushNotifications';

// --- GLOBAL / AUTH ---
import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';

// --- SHARED ---
import StaffChatScreen from './screens/shared/StaffChatScreen';

// --- CUSTOMER ---
import HomeScreen from './screens/customer/HomeScreen';
import BookingScreen from './screens/customer/BookingScreen';
import PreAssessmentScreen from './screens/customer/PreAssessmentScreen';
import MyPreAssessmentsScreen from './screens/customer/MyPreAssessmentsScreen';
import AppointmentsScreen from './screens/customer/AppointmentsScreen';
import ChatScreen from './screens/customer/ChatScreen';
import CustomizeScreen from './screens/customer/CustomizeScreen';
import ProfileScreen from './screens/customer/ProfileScreen';
import AppointmentDetailScreen from './screens/customer/AppointmentDetailScreen';
import ShopScreen from './screens/customer/ShopScreen';
import CheckoutScreen from './screens/customer/CheckoutScreen';
import OrderHistoryScreen from './screens/customer/OrderHistoryScreen';
import NotificationsScreen from './screens/customer/NotificationsScreen';
import OrderDetailsScreen from './screens/customer/OrderDetailsScreen';
import MechanicsScreen from './screens/customer/MechanicsScreen';
import BookingConfirmationScreen from './screens/customer/BookingConfirmationScreen';
import OrderConfirmationScreen from './screens/customer/OrderConfirmationScreen';

// --- MECHANIC ---
import JobsScreen from './screens/mechanic/JobsScreen';
import JobDetailScreen from './screens/mechanic/JobDetailScreen';
import MechanicRatingsScreen from './screens/mechanic/MechanicRatingsScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();
const ShopStack = createStackNavigator();

const YELLOW = '#EAB308';

function makeIcon(iconName) {
  return ({ color, size }) => (
    <Ionicons name={iconName} size={size} color={color} />
  );
}

function getTabOptions(theme, insets = { bottom: 0 }) {
  const bottomInset = Math.max(
    insets.bottom || 0,
    Platform.OS === 'android' ? 16 : 20
  );

  return {
    headerStyle: {
      backgroundColor: theme.bg,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    headerTitleStyle: {
      color: theme.text,
      fontWeight: 'bold',
    },
    tabBarStyle: {
      backgroundColor: theme.bg,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      height: 58 + bottomInset,
      paddingTop: 6,
      paddingBottom: bottomInset,
      elevation: 12,
    },
    tabBarItemStyle: {
      paddingVertical: 2,
    },
    tabBarLabelStyle: {
      fontSize: 11,
      fontWeight: '700',
      marginBottom: 0,
    },
    tabBarIconStyle: {
      marginTop: 2,
    },
    tabBarActiveTintColor: YELLOW,
    tabBarInactiveTintColor: theme.textMuted,
    tabBarHideOnKeyboard: true,
    tabBarBadgeStyle: {
      backgroundColor: YELLOW,
      color: '#fff',
      fontSize: 10,
      fontWeight: 'bold',
    },
  };
}

function getHeaderOptions(theme) {
  return {
    headerStyle: {
      backgroundColor: theme.bg,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    headerTitleStyle: {
      color: theme.text,
      fontWeight: 'bold',
    },
    headerTintColor: YELLOW,
  };
}

function useUnreadNotificationCount() {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let channel = null;
    let mounted = true;

    async function fetchUnreadNotifications() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id) {
        if (mounted) setUnreadCount(0);
        return;
      }

      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false);

      if (!error && mounted) {
        setUnreadCount(count || 0);
      }
    }

    async function setupRealtime() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id) return;

      channel = supabase
        .channel(`mobile-notifications-badge-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`,
          },
          fetchUnreadNotifications
        )
        .subscribe();
    }

    fetchUnreadNotifications();
    setupRealtime();

    return () => {
      mounted = false;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  return unreadCount;
}

function notificationBadgeOptions(unreadCount) {
  return {
    tabBarIcon: makeIcon('notifications'),
    tabBarLabel: 'Alerts',
    tabBarBadge:
      unreadCount > 0 ? (unreadCount > 99 ? '99+' : unreadCount) : undefined,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// CUSTOMER SHOP STACK
// ════════════════════════════════════════════════════════════════════════════
function CustomerShopStack() {
  const { theme } = useTheme();

  return (
    <ShopStack.Navigator screenOptions={getHeaderOptions(theme)}>
      <ShopStack.Screen
        name="ShopHome"
        component={ShopScreen}
        options={{ title: 'Shop' }}
      />

      <ShopStack.Screen
        name="Checkout"
        component={CheckoutScreen}
        options={{ title: 'Checkout' }}
      />

      <ShopStack.Screen
        name="OrderHistory"
        component={OrderHistoryScreen}
        options={{ title: 'Order History' }}
      />

      <ShopStack.Screen
        name="OrderDetails"
        component={OrderDetailsScreen}
        options={{ title: 'Order Details' }}
      />

      <ShopStack.Screen
        name="OrderConfirmation"
        component={OrderConfirmationScreen}
        options={{ title: 'Order Submitted' }}
      />
    </ShopStack.Navigator>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// CUSTOMER TABS
// ════════════════════════════════════════════════════════════════════════════
export function CustomerTabs() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { cartTotalItems } = useCart();
  const unreadNotifications = useUnreadNotificationCount();

  return (
    <Tab.Navigator screenOptions={getTabOptions(theme, insets)}>
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ tabBarIcon: makeIcon('home') }}
      />

      <Tab.Screen
        name="Appointments"
        component={AppointmentsScreen}
        options={{ tabBarIcon: makeIcon('calendar') }}
      />

      <Tab.Screen
        name="Shop"
        component={CustomerShopStack}
        options={{
          tabBarIcon: makeIcon('cart'),
          headerShown: false,
          tabBarBadge: cartTotalItems > 0 ? cartTotalItems : undefined,
        }}
      />

      <Tab.Screen
        name="Chat"
        component={ChatScreen}
        options={{ tabBarIcon: makeIcon('chatbubbles') }}
      />

      <Tab.Screen
        name="AI Preview"
        component={CustomizeScreen}
        options={{ tabBarIcon: makeIcon('color-palette') }}
      />

      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={notificationBadgeOptions(unreadNotifications)}
      />

      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarIcon: makeIcon('person') }}
      />
    </Tab.Navigator>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MECHANIC TABS
// ════════════════════════════════════════════════════════════════════════════
export function MechanicTabs() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const unreadNotifications = useUnreadNotificationCount();

  return (
    <Tab.Navigator screenOptions={getTabOptions(theme, insets)}>
      <Tab.Screen
        name="My Jobs"
        component={JobsScreen}
        options={{ tabBarIcon: makeIcon('build') }}
      />

      <Tab.Screen
        name="Ratings"
        component={MechanicRatingsScreen}
        options={{ tabBarIcon: makeIcon('star') }}
      />

      <Tab.Screen
        name="Chat"
        component={StaffChatScreen}
        options={{ tabBarIcon: makeIcon('chatbubbles') }}
      />

      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={notificationBadgeOptions(unreadNotifications)}
      />

      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarIcon: makeIcon('person') }}
      />
    </Tab.Navigator>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ROLE-GUARDED WRAPPERS
// ════════════════════════════════════════════════════════════════════════════
function CustomerMainGuarded({ navigation }) {
  return (
    <RoleGuard allowedRoles={['customer', 'user']} navigation={navigation}>
      <CustomerTabs />
    </RoleGuard>
  );
}

function MechanicMainGuarded({ navigation }) {
  return (
    <RoleGuard allowedRoles={['mechanic']} navigation={navigation}>
      <MechanicTabs />
    </RoleGuard>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// PUSH NOTIFICATION SETUP
// ════════════════════════════════════════════════════════════════════════════
function PushNotificationSetup() {
  useEffect(() => {
    let removeListeners = null;

    async function setupPushNotifications() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user?.id) {
        await registerForPushNotifications(user.id);
      }

      removeListeners = addNotificationListeners({
        onReceive: (notification) => {
          console.log('Notification received:', notification);
        },
        onResponse: (response) => {
          console.log('Notification opened:', response);
        },
      });
    }

    setupPushNotifications();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user?.id) {
        await registerForPushNotifications(session.user.id);
      }
    });

    return () => {
      if (removeListeners) removeListeners();
      subscription?.unsubscribe();
    };
  }, []);

  return null;
}

// ════════════════════════════════════════════════════════════════════════════
// ROOT NAVIGATOR
// ════════════════════════════════════════════════════════════════════════════
export function RootNav() {
  const { theme } = useTheme();

  const sharedHeader = getHeaderOptions(theme);

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Login">
      <Stack.Screen name="Login" component={LoginScreen} />

      <Stack.Screen name="Register" component={RegisterScreen} />

      <Stack.Screen name="Main" component={CustomerMainGuarded} />

      <Stack.Screen name="MechanicMain" component={MechanicMainGuarded} />

      <Stack.Screen
        name="BookingConfirmation"
        component={BookingConfirmationScreen}
        options={{
          headerShown: true,
          title: 'Booking Submitted',
          ...sharedHeader,
        }}
      />

      <Stack.Screen
        name="Mechanics"
        component={MechanicsScreen}
        options={{
          headerShown: true,
          title: 'Mechanics',
          ...sharedHeader,
        }}
      />

      <Stack.Screen
        name="Booking"
        component={BookingScreen}
        options={{
          headerShown: true,
          title: 'Book a Service',
          ...sharedHeader,
        }}
      />

      <Stack.Screen
        name="PreAssessment"
        component={PreAssessmentScreen}
        options={{
          headerShown: true,
          title: 'Pre-Assessment',
          ...sharedHeader,
        }}
      />

      <Stack.Screen
        name="MyPreAssessments"
        component={MyPreAssessmentsScreen}
        options={{
          headerShown: true,
          title: 'My Assessment Requests',
          ...sharedHeader,
        }}
      />

      <Stack.Screen
        name="AppointmentDetail"
        component={AppointmentDetailScreen}
        options={{
          headerShown: true,
          title: 'Appointment Details',
          ...sharedHeader,
        }}
      />

      <Stack.Screen
        name="JobDetail"
        component={JobDetailScreen}
        options={{
          headerShown: true,
          title: 'Job Details',
          ...sharedHeader,
        }}
      />
    </Stack.Navigator>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// APP ENTRY
// ════════════════════════════════════════════════════════════════════════════
export default function App() {
  return (
    <ThemeProvider>
      <CartProvider>
        <SafeAreaProvider>
          <NavigationContainer>
            <PushNotificationSetup />
            <RootNav />
          </NavigationContainer>
        </SafeAreaProvider>
      </CartProvider>
    </ThemeProvider>
  );
}
