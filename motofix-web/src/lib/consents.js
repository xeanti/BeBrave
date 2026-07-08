import { supabase } from './supabaseClient';

export const CONSENT_TYPES = {
  ACCOUNT_REGISTRATION: 'account_registration',
  BOOKING_PROCESSING: 'booking_processing',
  ORDER_PAYMENT_PROCESSING: 'order_payment_processing',
  AI_PHOTO_PROCESSING: 'ai_photo_processing',
  CHAT_SUPPORT: 'chat_support',
  NOTIFICATIONS: 'notifications',
  INVOICE_RECEIPT: 'invoice_receipt',
};

export const CONSENT_SOURCE_PAGES = {
  REGISTER: 'Register.jsx',
  BOOKING: 'Booking.jsx',
  CHECKOUT: 'Checkout.jsx',
  CUSTOMIZE: 'Customize.jsx',
  CHAT: 'Chat.jsx',
  NOTIFICATIONS: 'Notifications.jsx',
  PROFILE: 'Profile.jsx',
  ORDER_DETAILS: 'OrderDetails.jsx',
  ADMIN: 'Admin',
};

export const FALLBACK_CONSENT_DEFINITIONS = {
  [CONSENT_TYPES.ACCOUNT_REGISTRATION]: {
    consent_type: CONSENT_TYPES.ACCOUNT_REGISTRATION,
    consent_version: 'v1',
    version: '1.0',
    title: 'Account Registration Privacy Consent',
    consent_text:
      'I agree to MotoFix collecting and using my personal information for account creation, login, customer support, booking, orders, payments, notifications, invoices, and e-receipts.',
    is_required: true,
  },
  [CONSENT_TYPES.BOOKING_PROCESSING]: {
    consent_type: CONSENT_TYPES.BOOKING_PROCESSING,
    consent_version: 'v1',
    version: '1.0',
    title: 'Booking Processing Consent',
    consent_text:
      'I agree that MotoFix may use my booking details, motorcycle/service information, contact details, preferred schedule, notes, and assigned mechanic information to process my service request.',
    is_required: true,
  },
  [CONSENT_TYPES.ORDER_PAYMENT_PROCESSING]: {
    consent_type: CONSENT_TYPES.ORDER_PAYMENT_PROCESSING,
    consent_version: 'v1',
    version: '1.0',
    title: 'Order and Payment Processing Consent',
    consent_text:
      'I agree that MotoFix may use my order, cart, payment, contact, and transaction information to process parts orders, payment records, invoices, and e-receipts.',
    is_required: true,
  },
  [CONSENT_TYPES.AI_PHOTO_PROCESSING]: {
    consent_type: CONSENT_TYPES.AI_PHOTO_PROCESSING,
    consent_version: 'v1',
    version: '1.0',
    title: 'AI Photo Processing Consent',
    consent_text:
      'I agree that MotoFix may process my uploaded motorcycle photo only for generating the customization preview. I understand uploaded photos may contain sensitive details such as plate numbers, background objects, or location clues.',
    is_required: true,
  },
  [CONSENT_TYPES.CHAT_SUPPORT]: {
    consent_type: CONSENT_TYPES.CHAT_SUPPORT,
    consent_version: 'v1',
    version: '1.0',
    title: 'Chat Support Consent',
    consent_text:
      'I agree that my MotoFix chat messages may be stored and reviewed by admin, staff, or mechanics for customer support and service assistance.',
    is_required: true,
  },
  [CONSENT_TYPES.NOTIFICATIONS]: {
    consent_type: CONSENT_TYPES.NOTIFICATIONS,
    consent_version: 'v1',
    version: '1.0',
    title: 'Notification Consent',
    consent_text:
      'I agree to receive MotoFix notifications about bookings, orders, payments, invoices, e-receipts, service updates, and support messages.',
    is_required: false,
  },
  [CONSENT_TYPES.INVOICE_RECEIPT]: {
    consent_type: CONSENT_TYPES.INVOICE_RECEIPT,
    consent_version: 'v1',
    version: '1.0',
    title: 'Invoice and E-Receipt Consent',
    consent_text:
      'I agree that MotoFix may generate and store invoices, official receipt numbers, e-receipts, and payment history for my orders and bookings.',
    is_required: true,
  },
};

function normalizeConsentType(consentType) {
  return String(consentType || '').trim();
}

function normalizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }

  return metadata;
}

function normalizeConsentVersion(value) {
  const raw = String(value || '').trim();

  if (!raw) return '1.0';

  return raw.startsWith('v') ? raw.slice(1) || '1.0' : raw;
}

function normalizeDisplayConsentVersion(value) {
  const raw = String(value || '').trim();

  if (!raw) return 'v1';
  if (raw.startsWith('v')) return raw;

  return `v${raw.split('.')[0] || raw}`;
}

function normalizeConsentDefinition(definition) {
  if (!definition) return null;

  const version = normalizeConsentVersion(
    definition.version || definition.consent_version || '1.0'
  );

  return {
    ...definition,
    version,
    consent_version: definition.consent_version || normalizeDisplayConsentVersion(version),
  };
}

function normalizeConsentRecord(consent) {
  if (!consent) return null;

  const version = normalizeConsentVersion(
    consent.version || consent.consent_version || '1.0'
  );

  return {
    ...consent,
    version,
    consent_version: consent.consent_version || normalizeDisplayConsentVersion(version),
  };
}

function getFallbackConsentDefinition(consentType) {
  const normalizedType = normalizeConsentType(consentType);

  return (
    FALLBACK_CONSENT_DEFINITIONS[normalizedType] || {
      consent_type: normalizedType,
      consent_version: 'v1',
    version: '1.0',
      title: 'Privacy Consent',
      consent_text:
        'I agree that MotoFix may process my information for the selected system feature.',
      is_required: true,
    }
  );
}

export function getConsentErrorMessage(error, fallback = 'Consent request failed.') {
  if (!error) return fallback;

  return error.message || error.details || error.hint || fallback;
}

export async function getConsentDefinitions({ activeOnly = true } = {}) {
  let query = supabase
    .from('consent_definitions')
    .select(
      'consent_type, consent_version, title, consent_text, is_required, is_active, display_order, updated_at'
    )
    .order('display_order', { ascending: true });

  if (activeOnly) query = query.eq('is_active', true);

  const { data, error } = await query;

  if (error) throw error;

  return (data || []).map(normalizeConsentDefinition);
}

export async function getConsentDefinition(consentType) {
  const normalizedType = normalizeConsentType(consentType);

  if (!normalizedType) throw new Error('Consent type is required.');

  const { data, error } = await supabase
    .from('consent_definitions')
    .select(
      'consent_type, consent_version, title, consent_text, is_required, is_active, display_order, updated_at'
    )
    .eq('consent_type', normalizedType)
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw error;

  return normalizeConsentDefinition(data) || getFallbackConsentDefinition(normalizedType);
}

export async function getConsentDefinitionSafe(consentType) {
  try {
    return await getConsentDefinition(consentType);
  } catch (error) {
    console.warn('Using fallback consent definition:', error);
    return getFallbackConsentDefinition(consentType);
  }
}

export async function getConsentText(consentType) {
  const definition = await getConsentDefinitionSafe(consentType);
  return definition.consent_text;
}

export async function getCustomerConsents(customerId = null) {
  let query = supabase
    .from('customer_consents')
    .select('*')
    .order('created_at', { ascending: false });

  if (customerId) query = query.eq('customer_id', customerId);

  const { data, error } = await query;

  if (error) throw error;

  return (data || []).map(normalizeConsentRecord);
}

export async function getMyConsents() {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) throw authError;
  if (!user?.id) throw new Error('You must be logged in to view consent records.');

  return getCustomerConsents(user.id);
}

export async function getLatestCustomerConsent({
  customerId = null,
  consentType,
} = {}) {
  const normalizedType = normalizeConsentType(consentType);

  if (!normalizedType) throw new Error('Consent type is required.');

  let query = supabase
    .from('customer_consents')
    .select('*')
    .eq('consent_type', normalizedType)
    .order('accepted_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1);

  if (customerId) query = query.eq('customer_id', customerId);

  const { data, error } = await query;

  if (error) throw error;

  return normalizeConsentRecord(data?.[0]) || null;
}

export async function hasCustomerConsent({ customerId, consentType } = {}) {
  const normalizedType = normalizeConsentType(consentType);

  if (!customerId) throw new Error('Customer ID is required.');
  if (!normalizedType) throw new Error('Consent type is required.');

  const { data, error } = await supabase.rpc('has_customer_consent', {
    p_customer_id: customerId,
    p_consent_type: normalizedType,
  });

  if (!error && Boolean(data)) return true;

  // Fallback for schemas where accepted consent is stored using `version`
  // while older UI code expects `consent_version`.
  const latest = await getLatestCustomerConsent({
    customerId,
    consentType: normalizedType,
  });

  return isConsentAccepted(latest);
}

export async function hasMyConsent(consentType) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) throw authError;
  if (!user?.id) return false;

  return hasCustomerConsent({
    customerId: user.id,
    consentType,
  });
}

export async function acceptCustomerConsent({
  consentType,
  sourcePage = null,
  metadata = {},
} = {}) {
  const normalizedType = normalizeConsentType(consentType);

  if (!normalizedType) throw new Error('Consent type is required.');

  const { data, error } = await supabase.rpc('accept_customer_consent', {
    p_consent_type: normalizedType,
    p_source_page: sourcePage,
    p_metadata: normalizeMetadata(metadata),
  });

  if (error) throw error;

  const latest = await getLatestCustomerConsent({
    consentType: normalizedType,
  });

  return latest || data;
}

export async function acceptMultipleCustomerConsents({
  consentTypes = [],
  sourcePage = null,
  metadata = {},
} = {}) {
  if (!Array.isArray(consentTypes) || consentTypes.length === 0) {
    throw new Error('At least one consent type is required.');
  }

  const results = [];

  for (const consentType of consentTypes) {
    const result = await acceptCustomerConsent({
      consentType,
      sourcePage,
      metadata,
    });

    results.push(result);
  }

  return results;
}

export async function revokeCustomerConsent(consentType) {
  const normalizedType = normalizeConsentType(consentType);

  if (!normalizedType) throw new Error('Consent type is required.');

  const { data, error } = await supabase.rpc('revoke_customer_consent', {
    p_consent_type: normalizedType,
  });

  if (error) throw error;

  return Number(data || 0);
}

export function isConsentAccepted(consent) {
  return Boolean(consent?.is_accepted && !consent?.revoked_at);
}

export function getLatestAcceptedConsent(consents = [], consentType) {
  const normalizedType = normalizeConsentType(consentType);

  return (
    consents.find(
      (consent) =>
        consent.consent_type === normalizedType && isConsentAccepted(consent)
    ) || null
  );
}

export function groupConsentsByType(consents = []) {
  return consents.reduce((groups, consent) => {
    const type = consent.consent_type || 'unknown';

    if (!groups[type]) groups[type] = [];
    groups[type].push(consent);

    return groups;
  }, {});
}

export function getRequiredConsentTypesForPage(pageName) {
  switch (pageName) {
    case CONSENT_SOURCE_PAGES.REGISTER:
      return [
        CONSENT_TYPES.ACCOUNT_REGISTRATION,
        CONSENT_TYPES.INVOICE_RECEIPT,
      ];

    case CONSENT_SOURCE_PAGES.BOOKING:
      return [CONSENT_TYPES.BOOKING_PROCESSING];

    case CONSENT_SOURCE_PAGES.CHECKOUT:
      return [
        CONSENT_TYPES.ORDER_PAYMENT_PROCESSING,
        CONSENT_TYPES.INVOICE_RECEIPT,
      ];

    case CONSENT_SOURCE_PAGES.CUSTOMIZE:
      return [CONSENT_TYPES.AI_PHOTO_PROCESSING];

    case CONSENT_SOURCE_PAGES.CHAT:
      return [CONSENT_TYPES.CHAT_SUPPORT];

    case CONSENT_SOURCE_PAGES.NOTIFICATIONS:
      return [CONSENT_TYPES.NOTIFICATIONS];

    case CONSENT_SOURCE_PAGES.ORDER_DETAILS:
      return [CONSENT_TYPES.INVOICE_RECEIPT];

    default:
      return [];
  }
}

export async function ensureMyConsent({
  consentType,
  sourcePage = null,
  metadata = {},
  autoAccept = false,
} = {}) {
  const normalizedType = normalizeConsentType(consentType);

  if (!normalizedType) throw new Error('Consent type is required.');

  const alreadyAccepted = await hasMyConsent(normalizedType);

  if (alreadyAccepted) {
    return {
      accepted: true,
      created: false,
      consent: await getLatestCustomerConsent({
        consentType: normalizedType,
      }),
    };
  }

  if (!autoAccept) {
    return {
      accepted: false,
      created: false,
      consent: null,
    };
  }

  const consent = await acceptCustomerConsent({
    consentType: normalizedType,
    sourcePage,
    metadata,
  });

  return {
    accepted: true,
    created: true,
    consent,
  };
}