import React, { useEffect, useState } from 'react';
import { Platform, ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
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

// --- MECHANIC ---
import JobsScreen from './screens/mechanic/JobsScreen';
import JobDetailScreen from './screens/mechanic/JobDetailScreen';
import MechanicRatingsScreen from './screens/mechanic/MechanicRatingsScreen';

// --- STAFF ---
import WalkInsScreen from './screens/staff/WalkInsScreen';
import PaymentsScreen from './screens/staff/PaymentsScreen';
import InventoryScreen from './screens/staff/InventoryScreen';
import InventoryMovementsScreen from './screens/staff/InventoryMovementsScreen';

// --- ADMIN ---
import AdminDashboardScreen from './screens/admin/DashboardScreen';
import AdminBookingsScreen from './screens/admin/BookingsScreen';
import AdminOrdersScreen from './screens/admin/OrdersScreen';
import ReportsScreen from './screens/admin/ReportsScreen';
import AdminUsersScreen from './screens/admin/AdminUsersScreen';
import AdminMotorcycleModelsScreen from './screens/admin/AdminMotorcycleModelsScreen';
import AdminServicesScreen from './screens/admin/AdminServicesScreen';
import AdminSettingsScreen from './screens/admin/AdminSettingsScreen';
import AdminPreAssessmentsScreen from './screens/admin/AdminPreAssessmentsScreen';
import AdminAuditLogsScreen from './screens/admin/AdminAuditLogsScreen';
import AdminChatbotTemplatesScreen from './screens/admin/AdminChatbotTemplatesScreen';
import AdminBookingDetailsScreen from './screens/admin/AdminBookingDetailsScreen';
import AdminOrderDetailsScreen from './screens/admin/AdminOrderDetailsScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();
const ShopStack = createStackNavigator();
const AdminMoreStack = createStackNavigator();

const YELLOW = '#EAB308';

function makeIcon(iconName) {
  return ({ color, size }) => (
    <Ionicons name={iconName} size={size} color={color} />
  );
}

function getTabOptions(theme) {
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
      height: Platform.OS === 'ios' ? 80 : 65,
      paddingBottom: Platform.OS === 'ios' ? 24 : 10,
      paddingTop: 8,
    },
    tabBarActiveTintColor: YELLOW,
    tabBarInactiveTintColor: theme.textMuted,
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
    </ShopStack.Navigator>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// CUSTOMER TABS
// ════════════════════════════════════════════════════════════════════════════
export function CustomerTabs() {
  const { theme } = useTheme();
  const { cartTotalItems } = useCart();
  const unreadNotifications = useUnreadNotificationCount();

  return (
    <Tab.Navigator screenOptions={getTabOptions(theme)}>
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
  const unreadNotifications = useUnreadNotificationCount();

  return (
    <Tab.Navigator screenOptions={getTabOptions(theme)}>
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
// STAFF TABS
// ════════════════════════════════════════════════════════════════════════════
export function StaffTabs() {
  const { theme } = useTheme();
  const unreadNotifications = useUnreadNotificationCount();

  return (
    <Tab.Navigator screenOptions={getTabOptions(theme)}>
      <Tab.Screen
        name="Walk-ins"
        component={WalkInsScreen}
        options={{ tabBarIcon: makeIcon('walk') }}
      />

      <Tab.Screen
        name="Payments"
        component={PaymentsScreen}
        options={{ tabBarIcon: makeIcon('card') }}
      />

      <Tab.Screen
        name="Inventory"
        component={InventoryScreen}
        options={{ tabBarIcon: makeIcon('cube') }}
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
// ADMIN MORE SCREEN
// ════════════════════════════════════════════════════════════════════════════
function AdminMoreScreen({ navigation }) {
  const { theme } = useTheme();

const items = [
  { label: 'Orders', icon: 'cart', screen: 'AdminOrders' },
  { label: 'Services', icon: 'construct', screen: 'AdminServices' },
  { label: 'Booking Rules / Settings', icon: 'settings', screen: 'AdminSettings' },
  { label: 'Pre-Assessments', icon: 'clipboard', screen: 'AdminPreAssessments' },
  { label: 'Chatbot Templates', icon: 'sparkles', screen: 'AdminChatbotTemplates' },
  { label: 'Parts & Inventory', icon: 'cube', screen: 'AdminInv' },
  {
  label: 'Inventory History',
  icon: 'swap-horizontal',
  screen: 'InventoryMovements',
},
  { label: 'Models', icon: 'bicycle', screen: 'AdminModels' },
  { label: 'Users / Mechanics', icon: 'people', screen: 'AdminUsers' },
  { label: 'Audit Logs', icon: 'shield-checkmark', screen: 'AdminAuditLogs' },
  { label: 'Reports', icon: 'analytics', screen: 'AdminReports' },
];

  return (
    <ScrollView
      style={[styles.moreContainer, { backgroundColor: theme.bg }]}
      contentContainerStyle={styles.moreContent}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.moreTitle, { color: theme.text }]}>More</Text>

      {items.map((item) => (
        <TouchableOpacity
          key={item.screen}
          style={[styles.moreRow, { borderBottomColor: theme.border }]}
          onPress={() => navigation.navigate(item.screen)}
          activeOpacity={0.7}
        >
          <View style={[styles.moreIconWrap, { backgroundColor: YELLOW + '22' }]}>
            <Ionicons name={item.icon} size={22} color={YELLOW} />
          </View>

          <Text style={[styles.moreLabel, { color: theme.text }]}>
            {item.label}
          </Text>

          <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

function AdminMoreStackNav() {
  const { theme } = useTheme();

  return (
    <AdminMoreStack.Navigator screenOptions={{ headerShown: true, ...getHeaderOptions(theme) }}>
      <AdminMoreStack.Screen
        name="AdminMoreList"
        component={AdminMoreScreen}
        options={{ title: 'More' }}
      />

      <AdminMoreStack.Screen
        name="AdminOrders"
        component={AdminOrdersScreen}
        options={{ title: 'Orders' }}
      />

      <AdminMoreStack.Screen
        name="AdminServices"
        component={AdminServicesScreen}
        options={{ title: 'Services' }}
      />

      <AdminMoreStack.Screen
  name="AdminAuditLogs"
  component={AdminAuditLogsScreen}
  options={{ title: 'Audit Logs' }}
/>

      <AdminMoreStack.Screen
  name="AdminSettings"
  component={AdminSettingsScreen}
  options={{ title: 'Booking Rules' }}
/>

<AdminMoreStack.Screen
  name="AdminChatbotTemplates"
  component={AdminChatbotTemplatesScreen}
  options={{ title: 'Chatbot Templates' }}
/>

<AdminMoreStack.Screen
  name="AdminPreAssessments"
  component={AdminPreAssessmentsScreen}
  options={{ title: 'Pre-Assessments' }}
/>

      <AdminMoreStack.Screen
        name="AdminInv"
        component={InventoryScreen}
        options={{ title: 'Parts & Inventory' }}
      />

      <AdminMoreStack.Screen
        name="AdminModels"
        component={AdminMotorcycleModelsScreen}
        options={{ title: 'Models' }}
      />

      <AdminMoreStack.Screen
  name="InventoryMovements"
  component={InventoryMovementsScreen}
  options={{ title: 'Inventory History' }}
/>

      <AdminMoreStack.Screen
        name="AdminUsers"
        component={AdminUsersScreen}
        options={{ title: 'Users' }}
      />

      <AdminMoreStack.Screen
        name="AdminReports"
        component={ReportsScreen}
        options={{ title: 'Reports' }}
      />
    </AdminMoreStack.Navigator>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ADMIN TABS
// ════════════════════════════════════════════════════════════════════════════
export function AdminTabs() {
  const { theme } = useTheme();
  const unreadNotifications = useUnreadNotificationCount();

  return (
    <Tab.Navigator screenOptions={getTabOptions(theme)}>
      <Tab.Screen
        name="Dashboard"
        component={AdminDashboardScreen}
        options={{ tabBarIcon: makeIcon('pie-chart') }}
      />

      <Tab.Screen
        name="Bookings"
        component={AdminBookingsScreen}
        options={{ tabBarIcon: makeIcon('list') }}
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

      <Tab.Screen
        name="More"
        component={AdminMoreStackNav}
        options={{
          tabBarIcon: makeIcon('grid'),
          headerShown: false,
        }}
      />
    </Tab.Navigator>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ROLE-GUARDED WRAPPERS
// ════════════════════════════════════════════════════════════════════════════
function CustomerMainGuarded({ navigation }) {
  return (
    <RoleGuard allowedRoles={['customer']} navigation={navigation}>
      <CustomerTabs />
    </RoleGuard>
  );
}

function AdminMainGuarded({ navigation }) {
  return (
    <RoleGuard allowedRoles={['admin']} navigation={navigation}>
      <AdminTabs />
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

function StaffMainGuarded({ navigation }) {
  return (
    <RoleGuard allowedRoles={['staff', 'cashier']} navigation={navigation}>
      <StaffTabs />
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

      <Stack.Screen name="AdminMain" component={AdminMainGuarded} />

      <Stack.Screen name="MechanicMain" component={MechanicMainGuarded} />

      <Stack.Screen name="StaffMain" component={StaffMainGuarded} />

      <Stack.Screen
  name="AdminBookingDetails"
  component={AdminBookingDetailsScreen}
  options={{ title: 'Booking Details' }}
/>

<Stack.Screen
  name="AdminOrderDetails"
  component={AdminOrderDetailsScreen}
  options={{ title: 'Order Details' }}
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
        <NavigationContainer>
          <PushNotificationSetup />
          <RootNav />
        </NavigationContainer>
      </CartProvider>
    </ThemeProvider>
  );
}

// ─── Styles for AdminMoreScreen ─────────────────────────────────────────────
const styles = StyleSheet.create({
  moreContainer: {
    flex: 1,
  },
  moreContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 110,
  },
  moreTitle: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 16,
  },
  moreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    gap: 14,
  },
  moreIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
});