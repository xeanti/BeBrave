import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { NavigationContainer } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons'; 
import { ThemeProvider, useTheme } from './lib/ThemeContext';

// --- GLOBAL / AUTH MODULE SCREENS ---
import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';

// --- CUSTOMER MODULE SCREENS ---
import HomeScreen from './screens/customer/HomeScreen';
import BookingScreen from './screens/customer/BookingScreen';
import AppointmentsScreen from './screens/customer/AppointmentsScreen';
import ChatScreen from './screens/customer/ChatScreen';
import CustomizeScreen from './screens/customer/CustomizeScreen';
import ProfileScreen from './screens/customer/ProfileScreen';

// --- MECHANIC MODULE SCREENS ---
import JobsScreen from './screens/mechanic/JobsScreen';
import JobDetailScreen from './screens/mechanic/JobDetailScreen';

// --- STAFF MODULE SCREENS ---
import WalkInsScreen from './screens/staff/WalkInsScreen';
import PaymentsScreen from './screens/staff/PaymentsScreen';
import InventoryScreen from './screens/staff/InventoryScreen';

// --- ADMIN MODULE SCREENS ---
import AdminDashboardScreen from './screens/admin/DashboardScreen';
import AdminBookingsScreen from './screens/admin/BookingsScreen';
import ReportsScreen from './screens/admin/ReportsScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

// --- BOTTOM TAB NAVIGATORS ---

export function CustomerTabs() {
  const { theme } = useTheme();
  return (
    <Tab.Navigator screenOptions={getTabOptions(theme)}>
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarIcon: makeIcon('home') }} />
      <Tab.Screen name="Appointments" component={AppointmentsScreen} options={{ tabBarIcon: makeIcon('calendar') }} />
      <Tab.Screen name="Chat" component={ChatScreen} options={{ tabBarIcon: makeIcon('chatbubbles') }} />
      <Tab.Screen name="AI Preview" component={CustomizeScreen} options={{ tabBarIcon: makeIcon('color-palette') }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarIcon: makeIcon('person') }} />
    </Tab.Navigator>
  );
}

const MechanicStack = createStackNavigator();

export function MechanicMain() {
  const { theme } = useTheme();

  const headerStyle = {
    headerStyle: {
      backgroundColor: theme.bg,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    headerTitleStyle: {
      color: theme.text,
      fontWeight: 'bold',
    },
    headerTintColor: theme.primaryLight,
  };

  return (
    <MechanicStack.Navigator screenOptions={{ headerShown: false }}>
      <MechanicStack.Screen
        name="JobsList"
        component={JobsScreen}
        options={{
          ...headerStyle,
          headerShown: true,
          title: 'My Jobs',
        }}
      />
      <MechanicStack.Screen
        name="Job Detail"
        component={JobDetailScreen}
        options={{
          ...headerStyle,
          headerShown: true,
          title: 'Job Detail',
        }}
      />
      <MechanicStack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          ...headerStyle,
          headerShown: true,
          title: 'Profile',
        }}
      />
    </MechanicStack.Navigator>
  );
}

export function StaffTabs() {
  const { theme } = useTheme();
  return (
    <Tab.Navigator screenOptions={getTabOptions(theme)}>
      <Tab.Screen name="Walk-ins" component={WalkInsScreen} options={{ tabBarIcon: makeIcon('walk') }} />
      <Tab.Screen name="Payments" component={PaymentsScreen} options={{ tabBarIcon: makeIcon('card') }} />
      <Tab.Screen name="Inventory" component={InventoryScreen} options={{ tabBarIcon: makeIcon('cube') }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarIcon: makeIcon('person') }} />
    </Tab.Navigator>
  );
}

export function AdminTabs() {
  const { theme } = useTheme();
  return (
    <Tab.Navigator screenOptions={getTabOptions(theme)}>
      <Tab.Screen name="Dashboard" component={AdminDashboardScreen} options={{ tabBarIcon: makeIcon('pie-chart') }} />
      <Tab.Screen name="Bookings" component={AdminBookingsScreen} options={{ tabBarIcon: makeIcon('list') }} />
      <Tab.Screen name="Inventory" component={InventoryScreen} options={{ tabBarIcon: makeIcon('cube') }} />
      <Tab.Screen name="Reports" component={ReportsScreen} options={{ tabBarIcon: makeIcon('analytics') }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarIcon: makeIcon('person') }} />
    </Tab.Navigator>
  );
}

// --- MAIN NAVIGATION ROOT ---
export function RootNav() {
  const { theme } = useTheme();

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Login">
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Register" component={RegisterScreen} />
        
        <Stack.Screen name="Main" component={CustomerTabs} />
        <Stack.Screen name="AdminMain" component={AdminTabs} />
        <Stack.Screen name="MechanicMain" component={MechanicMain} />
        <Stack.Screen name="StaffMain" component={StaffTabs} />
        
        <Stack.Screen 
          name="Booking" 
          component={BookingScreen} 
          options={{ 
            headerShown: true,
            headerStyle: { backgroundColor: theme.bg, borderBottomWidth: 1, borderBottomColor: theme.border },
            headerTitleStyle: { color: theme.text, fontWeight: 'bold' },
            headerTintColor: theme.primaryLight
          }} 
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

// --- MAIN ENTRY POINT ---
export default function App() {
  return (
    <ThemeProvider>
      <RootNav />
    </ThemeProvider>
  );
}

// --- OPTIONS & TAB ICON STYLES ---

function getTabOptions(theme) {
  return {
    headerStyle: { backgroundColor: theme.bg, borderBottomWidth: 1, borderBottomColor: theme.border },
    headerTitleStyle: { color: theme.text, fontWeight: 'bold' },
    tabBarStyle: { backgroundColor: theme.bg, borderTopWidth: 1, borderTopColor: theme.border, height: 60, paddingBottom: 8 },
    tabBarActiveTintColor: theme.primaryLight,
    tabBarInactiveTintColor: theme.textMuted,
  };
}

function makeIcon(iconName) {
  return ({ color, size }) => <Ionicons name={iconName} size={size} color={color} />;
}