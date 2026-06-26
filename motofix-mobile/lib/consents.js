import { Alert } from 'react-native';
import { supabase } from './supabase';

export const CONSENT_TYPES = {
  TERMS: 'terms_and_conditions',
  DATA_PRIVACY: 'data_privacy',
  BOOKING_POLICY: 'booking_policy',
  CHECKOUT_POLICY: 'checkout_policy',
  AI_PHOTO: 'ai_photo_processing',
  NOTIFICATIONS: 'notifications',
};

export const CONSENT_VERSION = '1.0';

async function getCurrentUserId() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.id) {
    return null;
  }

  return user.id;
}

export async function hasCustomerConsent(consentType, version = CONSENT_VERSION) {
  const userId = await getCurrentUserId();

  if (!userId) return false;

  const { data, error } = await supabase.rpc('has_customer_consent', {
    p_customer_id: userId,
    p_consent_type: consentType,
    p_version: version,
  });

  if (error) {
    console.log('hasCustomerConsent error:', error.message);
    return false;
  }

  return Boolean(data);
}

export async function acceptCustomerConsent(consentType, version = CONSENT_VERSION) {
  const userId = await getCurrentUserId();

  if (!userId) {
    throw new Error('You must be logged in to accept this consent.');
  }

  const { data, error } = await supabase.rpc('accept_customer_consent', {
    p_customer_id: userId,
    p_consent_type: consentType,
    p_version: version,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function revokeCustomerConsent(consentType, version = CONSENT_VERSION) {
  const userId = await getCurrentUserId();

  if (!userId) {
    throw new Error('You must be logged in to revoke this consent.');
  }

  const { data, error } = await supabase.rpc('revoke_customer_consent', {
    p_customer_id: userId,
    p_consent_type: consentType,
    p_version: version,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function requireCustomerConsent({
  consentType,
  title = 'Consent Required',
  message = 'Please review and accept the required consent before continuing.',
  version = CONSENT_VERSION,
}) {
  const alreadyAccepted = await hasCustomerConsent(consentType, version);

  if (alreadyAccepted) return true;

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      {
        text: 'Cancel',
        style: 'cancel',
        onPress: () => resolve(false),
      },
      {
        text: 'I Agree',
        onPress: async () => {
          try {
            await acceptCustomerConsent(consentType, version);
            resolve(true);
          } catch (error) {
            Alert.alert(
              'Consent Error',
              error.message || 'Unable to save consent.'
            );
            resolve(false);
          }
        },
      },
    ]);
  });
}