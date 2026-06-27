import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

function getProjectId() {
  return (
    Constants?.expoConfig?.extra?.eas?.projectId ||
    Constants?.easConfig?.projectId
  );
}

async function getCurrentExpoPushToken() {
  try {
    if (!Device.isDevice) return null;

    const projectId = getProjectId();

    if (!projectId) {
      console.log('Missing EAS projectId. Run eas init or add projectId in app.json.');
      return null;
    }

    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    return tokenResponse.data;
  } catch (error) {
    console.log('Get current Expo push token error:', error.message);
    return null;
  }
}

export async function registerForPushNotifications(userId) {
  if (!userId) return null;

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'MotoFix Notifications',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#EAB308',
        sound: 'default',
      });
    }

    if (!Device.isDevice) {
      console.log('Push notifications work best on a real device or development build.');
      return null;
    }

    const existingPermission = await Notifications.getPermissionsAsync();
    let finalStatus = existingPermission.status;

    if (finalStatus !== 'granted') {
      const requestedPermission = await Notifications.requestPermissionsAsync();
      finalStatus = requestedPermission.status;
    }

    if (finalStatus !== 'granted') {
      console.log('Notification permission was not granted.');
      return null;
    }

    const expoPushToken = await getCurrentExpoPushToken();

    if (!expoPushToken) return null;

    const { error } = await supabase.from('push_tokens').upsert(
      {
        user_id: userId,
        expo_push_token: expoPushToken,
        platform: Platform.OS,
        device_name: Device.deviceName || null,
        app_version: Constants?.expoConfig?.version || null,
        is_active: true,
        last_seen_at: new Date().toISOString(),
      },
      {
        onConflict: 'expo_push_token',
      }
    );

    if (error) {
      console.log('Failed to save push token:', error.message);
      return null;
    }

    console.log('Expo push token saved:', expoPushToken);
    return expoPushToken;
  } catch (error) {
    console.log('Push notification registration error:', error.message);
    return null;
  }
}

export async function unregisterPushToken(userId) {
  try {
    if (!userId) return;

    const expoPushToken = await getCurrentExpoPushToken();

    if (!expoPushToken) return;

    const { error } = await supabase
      .from('push_tokens')
      .delete()
      .eq('user_id', userId)
      .eq('expo_push_token', expoPushToken);

    if (error) {
      console.log('Failed to unregister push token:', error.message);
      return;
    }

    console.log('Expo push token unregistered:', expoPushToken);
  } catch (error) {
    console.log('Unregister push token error:', error.message);
  }
}

export function addNotificationListeners({ onReceive, onResponse } = {}) {
  const receivedSubscription = Notifications.addNotificationReceivedListener(
    (notification) => {
      if (onReceive) onReceive(notification);
    }
  );

  const responseSubscription =
    Notifications.addNotificationResponseReceivedListener((response) => {
      if (onResponse) onResponse(response);
    });

  return () => {
    receivedSubscription.remove();
    responseSubscription.remove();
  };
}
