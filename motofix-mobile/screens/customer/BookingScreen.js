import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, StatusBar, Alert, Platform, Image,
  Modal, Linking
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '../../lib/supabase';
import { notifyRole, notifyUser } from '../../lib/notifications';
import { CONSENT_TYPES, requireCustomerConsent } from '../../lib/consents';
import { useTheme } from '../../lib/ThemeContext';
import { createBookingQrphCheckout } from '../../lib/paymongo';

const SHOP_OPEN = 8;
const SHOP_CLOSE = 17;

function timeToMinutes(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function generateTimeSlots() {
  const slots = [];
  for (let hour = SHOP_OPEN; hour < SHOP_CLOSE; hour++) {
    slots.push(`${String(hour).padStart(2, '0')}:00`);
    slots.push(`${String(hour).padStart(2, '0')}:30`);
  }
  return slots;
}

const timeSlots = generateTimeSlots();
const TOTAL_STEPS = 5;

const PERSONAL_GCASH_NUMBER = '09087532431';
const PERSONAL_GCASH_NAME = 'Sean Timothy M.';

const PAYMENT_METHODS = [
  {
    key: 'paymongo_qrph',
    title: 'PayMongo QR / GCash',
    subtitle: 'Open online QR checkout after booking.',
    icon: '📲',
  },
  {
    key: 'gcash_manual',
    title: 'Personal GCash / Manual',
    subtitle: `Send payment to ${PERSONAL_GCASH_NUMBER} - ${PERSONAL_GCASH_NAME}, then enter your reference number.`,
    icon: '💸',
  },
  {
    key: 'cash_at_shop',
    title: 'Cash at Shop',
    subtitle: 'Pay the reservation fee at the shop counter.',
    icon: '💵',
  },
];

function getPaymentMethodLabel(method) {
  if (method === 'paymongo_qrph') return 'PayMongo QR / GCash';
  if (method === 'gcash_manual') return 'Personal GCash / Manual';
  if (method === 'cash_at_shop') return 'Cash at Shop';

  return 'PayMongo QR / GCash';
}

function getInitialPaymentStatus(method) {
  if (method === 'paymongo_qrph') return 'unpaid';
  if (method === 'gcash_manual') return 'pending_verification';
  if (method === 'cash_at_shop') return 'pending_payment';

  return 'unpaid';
}

function getServicePrice(service) {
  return (Number(service?.base_price) || 0) + (Number(service?.labor_cost) || 0);
}

function getServicesTotal(serviceList = []) {
  return serviceList.reduce((sum, service) => sum + getServicePrice(service), 0);
}

function getServicesDuration(serviceList = []) {
  return serviceList.reduce(
    (sum, service) => sum + (Number(service?.estimated_duration_minutes) || 30),
    0
  );
}

function getServicesSummary(serviceList = []) {
  if (!serviceList.length) return 'No service selected';
  return serviceList.map((service) => service.name).join(', ');
}

function getExistingBookingDuration(booking) {
  const multiRows = booking?.booking_services || [];

  if (Array.isArray(multiRows) && multiRows.length > 0) {
    return multiRows.reduce(
      (sum, row) =>
        sum +
        ((Number(row.estimated_duration_minutes) || 30) *
          (Number(row.quantity) || 1)),
      0
    );
  }

  return Number(booking?.services?.estimated_duration_minutes) || 30;
}

function sanitizeMotorcycleText(value, max = 60) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9\s.'’\-\/()]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, max);
}

function sanitizeYear(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 4);
}

function sanitizeLongText(value, max = 700) {
  return String(value || '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, max);
}

function sanitizeGcashReference(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 20);
}

function isValidMotorcycleYear(value) {
  if (!value) return true;

  const year = Number(value);
  const maxYear = new Date().getFullYear() + 1;

  return Number.isInteger(year) && year >= 1950 && year <= maxYear;
}


async function checkBookingSlotAvailable({
  bookingDate,
  bookingTime,
  durationMinutes,
  mechanicId = null,
  excludeBookingId = null,
}) {
  const safeDuration = Math.max(30, Number(durationMinutes) || 60);

  const { data, error } = await supabase.rpc('check_booking_slot_available', {
    p_booking_date: bookingDate,
    p_booking_time: bookingTime,
    p_duration_minutes: safeDuration,
    p_mechanic_id: mechanicId || null,
    p_exclude_booking_id: excludeBookingId || null,
  });

  if (error) throw error;

  const result = Array.isArray(data) ? data[0] : data;

  return {
    available: result?.available === true,
    reason: result?.reason || 'Selected time is not available.',
    conflictCount: Number(result?.conflict_count) || 0,
    conflicts: result?.conflicts || [],
  };
}

function getAvailableMechanicIdsFromResults(results = []) {
  return results
    .filter((item) => item?.available === true && item?.mechanic?.id)
    .map((item) => item.mechanic.id);
}


export default function BookingScreen({ route, navigation }) {
  const { theme, isDark } = useTheme();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [certModal, setCertModal] = useState(null);
  const [mechanicCerts, setMechanicCerts] = useState([]);
  const [loadingCerts, setLoadingCerts] = useState(false);

  const [services, setServices] = useState([]);
  const [motorcycleModels, setMotorcycleModels] = useState([]);
  const [mechanics, setMechanics] = useState([]);

  const [selectedServices, setSelectedServices] = useState([]);
  const selectedService = selectedServices[0] || null;
  const [motorcycleMake, setMotorcycleMake] = useState('');
  const [motorcycleModel, setMotorcycleModel] = useState('');
  const [motorcycleYear, setMotorcycleYear] = useState('');
  const [issueDescription, setIssueDescription] = useState('');
  const [bookingDate, setBookingDate] = useState(null);
  const [bookingTime, setBookingTime] = useState('');
  const [notes, setNotes] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedMechanic, setSelectedMechanic] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('paymongo_qrph');
  const [manualReference, setManualReference] = useState('');

  const [bookedMechanicIds, setBookedMechanicIds] = useState([]);
  const [unavailableTimeSlots, setUnavailableTimeSlots] = useState([]);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [checkingTimeSlots, setCheckingTimeSlots] = useState(false);

  useEffect(() => {
    if (route?.params?.preselectedService) {
      setSelectedServices([route.params.preselectedService]);
      setStep(2);
    }
  }, [route?.params?.preselectedService]);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (step === 3 && bookingDate && selectedServices.length > 0) {
      fetchTimeSlotAvailability();
    }
  }, [step, bookingDate, selectedServices, mechanics]);

  useEffect(() => {
    if (step === 4 && bookingDate && bookingTime && selectedServices.length > 0) {
      fetchMechanicAvailability();
    }
  }, [step, bookingDate, bookingTime, selectedServices, mechanics]);

  function toggleService(service) {
    setSelectedServices((current) => {
      const exists = current.some((item) => item.id === service.id);

      if (exists) {
        return current.filter((item) => item.id !== service.id);
      }

      return [...current, service];
    });
  }

  async function viewCertificates(mechanic) {
    setCertModal(mechanic);
    setLoadingCerts(true);

    const { data } = await supabase
      .from('mechanic_certificates')
      .select('*')
      .eq('mechanic_id', mechanic.id)
      .order('created_at', { ascending: false });

    setMechanicCerts(data || []);
    setLoadingCerts(false);
  }

  async function fetchTimeSlotAvailability() {
    if (!bookingDate || selectedServices.length === 0) {
      setUnavailableTimeSlots([]);
      return;
    }

    setCheckingTimeSlots(true);

    try {
      const dateStr = toISODateString(bookingDate);
      const durationMinutes = getServicesDuration(selectedServices) || 30;

      const results = await Promise.all(
        timeSlots.map(async (slot) => {
          try {
            if (mechanics.length > 0) {
              const mechanicResults = await Promise.all(
                mechanics.map(async (mechanic) => {
                  const availability = await checkBookingSlotAvailable({
                    bookingDate: dateStr,
                    bookingTime: slot,
                    durationMinutes,
                    mechanicId: mechanic.id,
                  });

                  return {
                    mechanic,
                    available: availability.available,
                  };
                })
              );

              const availableMechanicIds = getAvailableMechanicIdsFromResults(mechanicResults);

              return {
                slot,
                available: availableMechanicIds.length > 0,
              };
            }

            const availability = await checkBookingSlotAvailable({
              bookingDate: dateStr,
              bookingTime: slot,
              durationMinutes,
              mechanicId: null,
            });

            return {
              slot,
              available: availability.available,
            };
          } catch {
            return {
              slot,
              available: true,
            };
          }
        })
      );

      const blockedSlots = results
        .filter((item) => !item.available)
        .map((item) => item.slot);

      setUnavailableTimeSlots(blockedSlots);

      if (bookingTime && blockedSlots.includes(bookingTime)) {
        setBookingTime('');
      }
    } finally {
      setCheckingTimeSlots(false);
    }
  }

  async function fetchMechanicAvailability() {
    if (!bookingDate || !bookingTime || selectedServices.length === 0) {
      setBookedMechanicIds([]);
      return;
    }

    setCheckingAvailability(true);

    try {
      const dateStr = toISODateString(bookingDate);
      const durationMinutes = getServicesDuration(selectedServices) || 30;

      const mechanicResults = await Promise.all(
        mechanics.map(async (mechanic) => {
          try {
            const availability = await checkBookingSlotAvailable({
              bookingDate: dateStr,
              bookingTime,
              durationMinutes,
              mechanicId: mechanic.id,
            });

            return {
              mechanic,
              available: availability.available,
            };
          } catch {
            return {
              mechanic,
              available: true,
            };
          }
        })
      );

      const unavailableMechanicIds = mechanicResults
        .filter((item) => !item.available)
        .map((item) => item.mechanic.id);

      setBookedMechanicIds(unavailableMechanicIds);
    } finally {
      setCheckingAvailability(false);
    }
  }

  async function findAvailableMechanicForSlot({ bookingDateStr, bookingTimeValue, durationMinutes }) {
    if (mechanics.length === 0) return null;

    const mechanicResults = await Promise.all(
      mechanics.map(async (mechanic) => {
        try {
          const availability = await checkBookingSlotAvailable({
            bookingDate: bookingDateStr,
            bookingTime: bookingTimeValue,
            durationMinutes,
            mechanicId: mechanic.id,
          });

          return {
            mechanic,
            available: availability.available,
          };
        } catch {
          return {
            mechanic,
            available: false,
          };
        }
      })
    );

    return mechanicResults.find((item) => item.available)?.mechanic || null;
  }

  async function fetchData() {
    setLoading(true);

    try {
      const { data: s } = await supabase
        .from('services')
        .select('*')
        .eq('is_active', true);

      const { data: m } = await supabase
        .from('motorcycle_models')
        .select('*')
        .order('make');

      const { data: mech } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'mechanic');

      setServices(s || []);
      setMotorcycleModels(m || []);
      setMechanics(mech || []);
    } catch (err) {
      console.log('FETCH ERROR:', err);
    } finally {
      setLoading(false);
    }
  }

  function toISODateString(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');

    return `${y}-${m}-${d}`;
  }

  function formatDisplayDate(date) {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function formatTimeSlot(slot) {
    if (!slot) return '—';

    const [h, m] = slot.split(':');
    const hour = parseInt(h, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;

    return `${displayHour}:${m} ${ampm}`;
  }

  function onChangeDate(event, selectedDate) {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);

      if (event.type === 'set' && selectedDate) {
        setBookingDate(selectedDate);
      }
    } else {
      if (selectedDate) {
        setBookingDate(selectedDate);
      }
    }
  }

  async function requireBookingConsents() {
  const acceptedTerms = await requireCustomerConsent({
    consentType: CONSENT_TYPES.TERMS,
    title: 'Terms and Conditions',
    message:
      'Before booking, please accept MotoFix Terms and Conditions, including booking rules, cancellation rules, and shop policies.',
  });

  if (!acceptedTerms) return false;

  const acceptedPrivacy = await requireCustomerConsent({
    consentType: CONSENT_TYPES.DATA_PRIVACY,
    title: 'Data Privacy Consent',
    message:
      'MotoFix will collect and process your account details, motorcycle details, booking information, and service records for booking and repair management.',
  });

  if (!acceptedPrivacy) return false;

  const acceptedBookingPolicy = await requireCustomerConsent({
    consentType: CONSENT_TYPES.BOOKING_POLICY,
    title: 'Booking Policy',
    message:
      'Please accept the booking policy. The shop may apply confirmation rules, cancellation rules, down payment requirements, and no-show penalties.',
  });

  return acceptedBookingPolicy;
}

async function hasUnsettledBookingPayment(userId) {
  const { data, error } = await supabase
    .from('bookings')
    .select('id, payment_status, status, booking_date, services(name)')
    .eq('customer_id', userId)
    .in('payment_status', ['unpaid', 'checkout_created', 'pending_payment', 'pending_verification'])
    .not('status', 'in', '("completed","cancelled")')
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.log('UNSETTLED PAYMENT CHECK ERROR:', error);
    return false;
  }

  return data?.[0] || null;
}

  async function handleSubmit() {
    if (!bookingDate) {
      Alert.alert('Error', 'Please select a booking date.');
      return;
    }

    if (!bookingTime) {
      Alert.alert('Error', 'Please select a time slot.');
      return;
    }

    setSubmitting(true);

const {
  data: { user },
} = await supabase.auth.getUser();

if (!user?.id) {
  setSubmitting(false);
  Alert.alert('Login Required', 'Please login before booking a service.');
  navigation.navigate('Login');
  return;
}

const unsettledBooking = await hasUnsettledBookingPayment(user.id);

if (unsettledBooking) {
  setSubmitting(false);

  Alert.alert(
    'Unsettled Payment',
    'You still have a booking with an unpaid reservation fee. Please settle or cancel your existing booking before creating a new one.'
  );

  navigation.navigate('Main', {
    screen: 'Appointments',
  });

  return;
}

const consentsAccepted = await requireBookingConsents();

if (!consentsAccepted) {
  setSubmitting(false);
  return;
}

const safeMotorcycleMake = sanitizeMotorcycleText(motorcycleMake).trim();
const safeMotorcycleModel = sanitizeMotorcycleText(motorcycleModel).trim();
const safeMotorcycleYear = sanitizeYear(motorcycleYear);
const safeIssueDescription = sanitizeLongText(issueDescription, 700).trim();
const safeNotes = sanitizeLongText(notes, 500).trim();
const safeManualReference = sanitizeGcashReference(manualReference);

if (!safeMotorcycleMake || !safeMotorcycleModel) {
  setSubmitting(false);
  Alert.alert('Motorcycle Details Required', 'Please enter a valid motorcycle make and model.');
  setStep(2);
  return;
}

if (!isValidMotorcycleYear(safeMotorcycleYear)) {
  setSubmitting(false);
  Alert.alert('Invalid Motorcycle Year', `Motorcycle year must be between 1950 and ${new Date().getFullYear() + 1}.`);
  setStep(2);
  return;
}

if (paymentMethod === 'gcash_manual' && safeManualReference.length < 4) {
  setSubmitting(false);
  Alert.alert('GCash Reference Required', 'Please enter a valid GCash reference number.');
  setStep(5);
  return;
}

const bookingDateStr = toISODateString(bookingDate);

    const bookingDurationMinutes = Math.max(30, servicesDuration || getServicesDuration(selectedServices) || 30);
    let assignedMechanic = selectedMechanic;

    try {
      if (selectedMechanic?.id) {
        const selectedMechanicAvailability = await checkBookingSlotAvailable({
          bookingDate: bookingDateStr,
          bookingTime,
          durationMinutes: bookingDurationMinutes,
          mechanicId: selectedMechanic.id,
        });

        if (!selectedMechanicAvailability.available) {
          Alert.alert(
            'Mechanic Unavailable',
            'This mechanic already has an overlapping booking for this duration. Please choose another mechanic or time.'
          );

          setSubmitting(false);
          setStep(4);
          fetchMechanicAvailability();
          return;
        }
      } else {
        assignedMechanic = await findAvailableMechanicForSlot({
          bookingDateStr,
          bookingTimeValue: bookingTime,
          durationMinutes: bookingDurationMinutes,
        });

        if (!assignedMechanic) {
          Alert.alert(
            'Schedule Not Available',
            'All mechanics already have overlapping bookings for this duration. Please choose another time slot.'
          );

          setSubmitting(false);
          setStep(3);
          fetchTimeSlotAvailability();
          return;
        }
      }
    } catch (availabilityError) {
      console.log('BOOKING AVAILABILITY RPC ERROR:', availabilityError);

      Alert.alert(
        'Availability Check Failed',
        availabilityError.message || 'Unable to check this booking schedule. Please try again.'
      );

      setSubmitting(false);
      return;
    }

    const { data: assessment, error: assessmentError } = await supabase
      .from('pre_assessments')
      .insert({
        customer_id: user.id,
        motorcycle_make: safeMotorcycleMake,
        motorcycle_model: safeMotorcycleModel,
        motorcycle_year: safeMotorcycleYear ? parseInt(safeMotorcycleYear, 10) : null,
        issue_description: safeIssueDescription || null,
        service_id: selectedService?.id || null,
        estimated_labor_cost: selectedServices.reduce((sum, service) => sum + (Number(service.labor_cost) || 0), 0),
        estimated_total: servicesTotal,
        status: 'pending',
        notes: [safeNotes, `Selected services: ${servicesSummary}`].filter(Boolean).join('\n'),
      })
      .select()
      .single();

    if (assessmentError) {
      Alert.alert('Error', assessmentError.message);
      setSubmitting(false);
      return;
    }

const { data: booking, error: bookingError } = await supabase
  .from('bookings')
  .insert({
    customer_id: user.id,
    service_id: selectedService?.id || null,
    mechanic_id: assignedMechanic?.id || null,
    booking_date: bookingDateStr,
    booking_time: bookingTime,
    status: 'pending',
    notes: safeNotes || null,
    service_total: servicesTotal,
    services_summary: servicesSummary,
    total_amount: servicesTotal,
    reservation_fee: reservationFeePreview,
    estimated_duration_minutes: bookingDurationMinutes,
    payment_method: paymentMethod,
    payment_status: getInitialPaymentStatus(paymentMethod),
    payment_reference:
      paymentMethod === 'gcash_manual' ? safeManualReference : null,
  })
  .select()
  .single();

if (bookingError) {
  setSubmitting(false);

  const message = String(bookingError.message || '').toLowerCase();

  if (
    message.includes('duplicate') ||
    message.includes('conflict') ||
    message.includes('occupied') ||
    message.includes('unavailable') ||
    message.includes('already booked')
  ) {
    Alert.alert(
      'Schedule Not Available',
      'The selected mechanic or time slot is no longer available. Please choose another mechanic or schedule.'
    );
    setStep(4);
    fetchMechanicAvailability();
    return;
  }

  Alert.alert('Error', bookingError.message);
  return;
}

const bookingServiceRows = selectedServices.map((service) => ({
  booking_id: booking.id,
  service_id: service.id,
  service_name: service.name,
  base_price: Number(service.base_price) || 0,
  labor_cost: Number(service.labor_cost) || 0,
  estimated_duration_minutes: Number(service.estimated_duration_minutes) || 0,
  quantity: 1,
}));

if (bookingServiceRows.length > 0) {
  const { error: bookingServicesError } = await supabase
    .from('booking_services')
    .insert(bookingServiceRows);

  if (bookingServicesError) {
    console.log('BOOKING SERVICES INSERT ERROR:', bookingServicesError.message);
  }
}

let checkoutData = null;

if (paymentMethod === 'paymongo_qrph') {
  try {
    checkoutData = await createBookingQrphCheckout(booking.id);

    await Linking.openURL(checkoutData.checkout_url);
  } catch (paymentError) {
    console.log('PAYMONGO QR PH ERROR:', paymentError);

    Alert.alert(
      'Booking Created',
      'Your booking was created, but the PayMongo QR Ph / GCash payment page could not open. You can pay later from your booking details.'
    );
  }
} else if (paymentMethod === 'gcash_manual') {
  Alert.alert(
    'Booking Submitted',
    `Your manual GCash reference was submitted. Please wait for staff verification.\n\nGCash Account: ${PERSONAL_GCASH_NUMBER}\nAccount Name: ${PERSONAL_GCASH_NAME}`
  );
} else if (paymentMethod === 'cash_at_shop') {
  Alert.alert(
    'Booking Submitted',
    'Please pay the reservation fee at the shop counter before confirmation.'
  );
}

const customerBookingMessage =
  paymentMethod === 'paymongo_qrph'
    ? checkoutData
      ? 'Your booking request has been submitted. Please complete your PayMongo QR / GCash reservation payment.'
      : 'Your booking request has been submitted, but payment is still unpaid. You can pay later from your booking details.'
    : paymentMethod === 'gcash_manual'
      ? `Your booking request has been submitted with manual GCash payment pending staff verification. Send payment to ${PERSONAL_GCASH_NUMBER} - ${PERSONAL_GCASH_NAME}.`
      : 'Your booking request has been submitted. Please pay the reservation fee at the shop counter.';

const adminBookingMessage =
  paymentMethod === 'paymongo_qrph'
    ? checkoutData
      ? 'A customer submitted a new service booking request and PayMongo QR payment was created.'
      : 'A customer submitted a new service booking request, but PayMongo payment checkout was not created.'
    : paymentMethod === 'gcash_manual'
      ? `A customer submitted a new booking with manual GCash reference for verification. Personal GCash: ${PERSONAL_GCASH_NUMBER} - ${PERSONAL_GCASH_NAME}.`
      : 'A customer submitted a new booking and selected Cash at Shop.';

    await notifyUser({
      userId: user.id,
      title: 'Booking Submitted',
      message: customerBookingMessage,
      type: 'booking',
      relatedTable: 'bookings',
      relatedId: booking.id,
    });

    await notifyRole({
      role: 'admin',
      title: 'New Booking Request',
      message: adminBookingMessage,
      type: 'booking',
      relatedTable: 'bookings',
      relatedId: booking.id,
    });

    await notifyRole({
  role: 'staff',
  title: 'New Booking Request',
  message: adminBookingMessage,
  type: 'booking',
  relatedTable: 'bookings',
  relatedId: booking.id,
});

    if (assignedMechanic?.id) {
      await notifyUser({
        userId: assignedMechanic.id,
        title: 'New Assigned Booking',
        message:
          paymentMethod === 'paymongo_qrph' && checkoutData
            ? 'A customer selected you for a new pending booking and reservation payment was started.'
            : paymentMethod === 'gcash_manual'
              ? `A customer selected you for a new pending booking with manual GCash pending verification. Personal GCash: ${PERSONAL_GCASH_NUMBER} - ${PERSONAL_GCASH_NAME}.`
              : paymentMethod === 'cash_at_shop'
                ? 'A customer selected you for a new pending booking with cash payment at shop.'
                : 'A customer selected you for a new pending booking.',
        type: 'booking',
        relatedTable: 'bookings',
        relatedId: booking.id,
      });
    }

    setSubmitting(false);

    navigation.replace('BookingConfirmation', {
      bookingId: booking.id,
      serviceName: servicesSummary,
      motorcycle: `${safeMotorcycleMake} ${safeMotorcycleModel} ${safeMotorcycleYear}`.trim(),
      bookingDate: bookingDateStr,
      bookingTime,
      mechanicName: assignedMechanic
        ? `${assignedMechanic.first_name || ''} ${assignedMechanic.last_name || ''}`.trim()
        : 'No preference / auto-assigned',
      totalAmount: servicesTotal,
      status: 'pending',
      paymentStatus:
        paymentMethod === 'paymongo_qrph'
          ? checkoutData
            ? 'checkout_created'
            : 'unpaid'
          : getInitialPaymentStatus(paymentMethod),
      reservationFee: checkoutData?.amount || reservationFeePreview,
      paymentReference:
        checkoutData?.reference_number ||
        (paymentMethod === 'gcash_manual' ? safeManualReference : null),
      checkoutUrl: checkoutData?.checkout_url || null,
      paymentMethod: getPaymentMethodLabel(paymentMethod),
    });
  }

  function handleNext() {
    if (step === 1 && selectedServices.length === 0) {
      Alert.alert('Error', 'Please select at least one service.');
      return;
    }

    if (step === 2) {
      const safeMotorcycleMake = sanitizeMotorcycleText(motorcycleMake).trim();
      const safeMotorcycleModel = sanitizeMotorcycleText(motorcycleModel).trim();
      const safeMotorcycleYear = sanitizeYear(motorcycleYear);
      const safeIssueDescription = sanitizeLongText(issueDescription, 700).trim();

      if (!safeMotorcycleMake || !safeMotorcycleModel) {
        Alert.alert('Error', 'Please enter your motorcycle make and model.');
        return;
      }

      if (!isValidMotorcycleYear(safeMotorcycleYear)) {
        Alert.alert('Invalid Motorcycle Year', `Motorcycle year must be between 1950 and ${new Date().getFullYear() + 1}.`);
        return;
      }

      setMotorcycleMake(safeMotorcycleMake);
      setMotorcycleModel(safeMotorcycleModel);
      setMotorcycleYear(safeMotorcycleYear);
      setIssueDescription(safeIssueDescription);
    }

    if (step === 3 && !bookingDate) {
      Alert.alert('Error', 'Please select a booking date.');
      return;
    }

    if (step === 3 && !bookingTime) {
      Alert.alert('Error', 'Please select a time slot.');
      return;
    }

    setStep(step + 1);
  }

  const servicesTotal = useMemo(() => getServicesTotal(selectedServices), [selectedServices]);
  const servicesDuration = useMemo(() => getServicesDuration(selectedServices), [selectedServices]);
  const servicesSummary = useMemo(() => getServicesSummary(selectedServices), [selectedServices]);

  const reservationFeePreview = Number((servicesTotal * 0.2).toFixed(2));

  const s = styles(theme);

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={theme.primaryLight} />
      </View>
    );
  }

  return (
    <View style={s.container}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.bg}
      />

      <View style={s.progressBar}>
        {[1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={s.progressStep}>
            <View style={[s.progressDot, step >= i && s.progressDotActive]}>
              <Text style={[s.progressNum, step >= i && s.progressNumActive]}>
                {i}
              </Text>
            </View>

            {i < TOTAL_STEPS && (
              <View style={[s.progressLine, step > i && s.progressLineActive]} />
            )}
          </View>
        ))}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        style={s.scrollContainer}
        contentContainerStyle={s.content}
      >
        {step === 1 && (
          <View>
            <Text style={s.stepTitle}>Select Services</Text>
            <Text style={s.stepSub}>Choose one or more services you need for this booking</Text>

            {selectedServices.length > 0 && (
              <View style={s.selectedServicesBox}>
                <View style={s.selectedServicesHeader}>
                  <Text style={s.selectedServicesTitle}>
                    Selected Services ({selectedServices.length})
                  </Text>
                  <Text style={s.selectedServicesTotal}>
                    ₱{servicesTotal.toLocaleString('en-PH')} · {servicesDuration} mins
                  </Text>
                </View>

                {selectedServices.map((service) => (
                  <View key={service.id} style={s.selectedServiceRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.selectedServiceName}>{service.name}</Text>
                      <Text style={s.selectedServiceMeta}>
                        ₱{getServicePrice(service).toLocaleString('en-PH')} · {Number(service.estimated_duration_minutes) || 30} mins
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={s.removeServiceBtn}
                      onPress={() => toggleService(service)}
                    >
                      <Text style={s.removeServiceText}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {services.map((sv) => (
              <TouchableOpacity
                key={sv.id}
                style={[
                  s.serviceCard,
                  selectedServices.some((item) => item.id === sv.id) && s.serviceCardActive,
                ]}
                onPress={() => toggleService(sv)}
              >
                <View style={s.serviceCardLeft}>
                  <Text style={s.serviceCardName}>{sv.name}</Text>
                  <Text style={s.serviceCardDesc}>{sv.description}</Text>
                  <Text style={s.serviceCardDuration}>
                    ⏱ {sv.estimated_duration_minutes} mins
                  </Text>
                </View>

                <View style={s.serviceCardRight}>
                  <Text style={s.serviceCardPrice}>
                    ₱{getServicePrice(sv).toLocaleString('en-PH')}
                  </Text>
                  {selectedServices.some((item) => item.id === sv.id) ? (
                    <View style={s.selectedPill}>
                      <Text style={s.selectedPillText}>Selected ✓</Text>
                    </View>
                  ) : (
                    <Text style={s.addServiceText}>Tap to add</Text>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {step === 2 && (
          <View>
            <Text style={s.stepTitle}>Motorcycle Details</Text>
            <Text style={s.stepSub}>Tell us about your bike</Text>

            <Text style={s.label}>Make</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. Honda, Yamaha, Kawasaki"
              placeholderTextColor={theme.textMuted}
              value={motorcycleMake}
              onChangeText={(value) => setMotorcycleMake(sanitizeMotorcycleText(value))}
              maxLength={60}
            />

            <Text style={s.label}>Model</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. CBR500R, MT-07"
              placeholderTextColor={theme.textMuted}
              value={motorcycleModel}
              onChangeText={(value) => setMotorcycleModel(sanitizeMotorcycleText(value))}
              maxLength={60}
            />

            <Text style={s.label}>Year</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. 2022"
              placeholderTextColor={theme.textMuted}
              value={motorcycleYear}
              onChangeText={(value) => setMotorcycleYear(sanitizeYear(value))}
              keyboardType="numeric"
              maxLength={4}
            />

            <Text style={s.label}>Issue Description</Text>
            <TextInput
              style={[s.input, s.textArea]}
              placeholder="Describe what is wrong with your motorcycle..."
              placeholderTextColor={theme.textMuted}
              value={issueDescription}
              onChangeText={(value) => setIssueDescription(sanitizeLongText(value, 700))}
              maxLength={700}
              multiline
              numberOfLines={4}
            />

            {motorcycleModels.length > 0 && (
              <View style={{ marginTop: 8 }}>
                <Text style={s.label}>Quick Pick (from our database)</Text>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={s.quickPicks}
                >
                  {motorcycleModels.map((m) => (
                    <TouchableOpacity
                      key={m.id}
                      style={s.quickPickChip}
                      onPress={() => {
                        setMotorcycleMake(sanitizeMotorcycleText(m.make));
                        setMotorcycleModel(sanitizeMotorcycleText(m.model));
                      }}
                    >
                      <Text style={s.quickPickText}>
                        {m.make} {m.model}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
        )}

        {step === 3 && (
          <View>
            <Text style={s.stepTitle}>Schedule</Text>
            <Text style={s.stepSub}>Pick your preferred date and time</Text>

            <Text style={s.label}>Booking Date</Text>

            <TouchableOpacity
              style={s.dateCard}
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.7}
            >
              <Text style={s.dateCardIcon}>📅</Text>

              <Text style={bookingDate ? s.dateCardText : s.dateCardPlaceholder}>
                {bookingDate
                  ? formatDisplayDate(bookingDate)
                  : 'Tap to choose a date'}
              </Text>

              <Text style={s.dateCardChevron}>›</Text>
            </TouchableOpacity>

            {showDatePicker && (
              <DateTimePicker
                value={bookingDate || new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                minimumDate={new Date()}
                onChange={onChangeDate}
                themeVariant={isDark ? 'dark' : 'light'}
                accentColor={theme.primary}
                style={s.nativePicker}
              />
            )}

            {Platform.OS === 'ios' && showDatePicker && (
              <TouchableOpacity
                style={s.dateDoneBtn}
                onPress={() => setShowDatePicker(false)}
              >
                <Text style={s.dateDoneBtnText}>Done</Text>
              </TouchableOpacity>
            )}

            <Text style={s.label}>Select Time Slot</Text>

            {checkingTimeSlots && (
              <Text style={s.checkingText}>
                Checking available time slots based on total service duration...
              </Text>
            )}

            {servicesDuration > 0 && (
              <Text style={s.durationNotice}>
                Selected services need about {servicesDuration} minutes. Overlapping time slots are disabled.
              </Text>
            )}

            <View style={s.timeGrid}>
              {timeSlots.map((t) => {
                const isUnavailable = unavailableTimeSlots.includes(t);

                return (
                  <TouchableOpacity
                    key={t}
                    style={[
                      s.timeChip,
                      bookingTime === t && s.timeChipActive,
                      isUnavailable && s.timeChipDisabled,
                    ]}
                    onPress={() => {
                      if (isUnavailable) {
                        Alert.alert(
                          'Time Slot Unavailable',
                          'This time overlaps with an existing booking duration. Please choose another time.'
                        );
                        return;
                      }

                      setBookingTime(t);
                    }}
                    disabled={checkingTimeSlots}
                  >
                    <Text
                      style={[
                        s.timeChipText,
                        bookingTime === t && s.timeChipTextActive,
                        isUnavailable && s.timeChipTextDisabled,
                      ]}
                    >
                      {formatTimeSlot(t)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={s.label}>Additional Notes (optional)</Text>

            <TextInput
              style={[s.input, s.textArea]}
              placeholder="Any other details..."
              placeholderTextColor={theme.textMuted}
              value={notes}
              onChangeText={(value) => setNotes(sanitizeLongText(value, 500))}
              maxLength={500}
              multiline
              numberOfLines={3}
            />
          </View>
        )}

        {step === 4 && (
          <View>
            <Text style={s.stepTitle}>Choose a Mechanic</Text>
            <Text style={s.stepSub}>Optional — or let us assign one for you</Text>

            <TouchableOpacity
              style={[
                s.mechanicCard,
                selectedMechanic === null && s.mechanicCardActive,
              ]}
              onPress={() => setSelectedMechanic(null)}
            >
              <View style={s.mechanicAvatarPlaceholder}>
                <Text style={s.mechanicAvatarEmoji}>🔧</Text>
              </View>

              <View style={s.mechanicInfo}>
                <Text style={s.mechanicName}>No Preference</Text>
                <Text style={s.mechanicSpec}>
                  We'll automatically assign an available mechanic
                </Text>
              </View>

              {selectedMechanic === null && <Text style={s.checkmark}>✓</Text>}
            </TouchableOpacity>

            {checkingAvailability && (
              <Text style={s.checkingText}>
                Checking mechanic availability for this slot...
              </Text>
            )}

            {mechanics.length === 0 ? (
              <View style={s.emptyMechanics}>
                <Text style={s.emptyMechanicsText}>No mechanics listed yet.</Text>
              </View>
            ) : (
              <View>
                {mechanics.map((mech) => {
                  const isBooked = bookedMechanicIds.includes(mech.id);

                  return (
                    <TouchableOpacity
                      key={mech.id}
                      style={[
                        s.mechanicCard,
                        selectedMechanic?.id === mech.id && s.mechanicCardActive,
                        isBooked && s.mechanicCardDisabled,
                      ]}
                      onPress={() => !isBooked && setSelectedMechanic(mech)}
                      disabled={isBooked}
                    >
                      {mech.profile_photo_url ? (
                        <Image
                          source={{ uri: mech.profile_photo_url }}
                          style={s.mechanicAvatar}
                        />
                      ) : (
                        <View style={s.mechanicAvatarPlaceholder}>
                          <Text style={s.mechanicAvatarInitials}>
                            {mech.first_name?.[0]}
                            {mech.last_name?.[0]}
                          </Text>
                        </View>
                      )}

                      <View style={s.mechanicInfo}>
                        <Text
                          style={[
                            s.mechanicName,
                            isBooked && { opacity: 0.5 },
                          ]}
                        >
                          {mech.first_name} {mech.last_name}
                        </Text>

                        {mech.specialization ? (
                          <Text style={s.mechanicSpec}>{mech.specialization}</Text>
                        ) : null}

                        {mech.rating_avg != null ? (
                          <Text style={s.mechanicRating}>
                            ⭐ {Number(mech.rating_avg).toFixed(1)}
                          </Text>
                        ) : null}

                        {isBooked && (
                          <Text style={s.mechanicBookedText}>
                            🚫 Already booked at this time
                          </Text>
                        )}

                        {!isBooked && (
                          <TouchableOpacity
                            style={s.certBtn}
                            onPress={(e) => {
                              e.stopPropagation();
                              viewCertificates(mech);
                            }}
                          >
                            <Text
                              style={[
                                s.certBtnText,
                                { color: theme.primaryLight },
                              ]}
                            >
                              🎓 View Certificates
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      {selectedMechanic?.id === mech.id && !isBooked && (
                        <Text style={s.checkmark}>✓</Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <View style={s.optionalNote}>
              <Text style={s.optionalNoteText}>
                💡 Selecting a mechanic is optional. Mechanics already booked for
                your chosen date/time are shown as unavailable.
              </Text>
            </View>
          </View>
        )}

        {step === 5 && (
          <View>
            <Text style={s.stepTitle}>Confirm Booking</Text>
            <Text style={s.stepSub}>Review your booking details</Text>

            <View style={s.summaryCard}>
              <Text style={s.summaryTitle}>🔧 Services ({selectedServices.length})</Text>
              {selectedServices.map((service) => (
                <Text key={service.id} style={s.summaryValue}>
                  • {service.name} — ₱{getServicePrice(service).toLocaleString('en-PH')}
                </Text>
              ))}
              <Text style={[s.summaryValue, { color: theme.textSub, fontSize: 12 }]}>
                Estimated duration: {servicesDuration} minutes
              </Text>

              <View style={s.divider} />

              <Text style={s.summaryTitle}>🏍️ Motorcycle</Text>
              <Text style={s.summaryValue}>
                {motorcycleMake} {motorcycleModel} {motorcycleYear}
              </Text>

              <View style={s.divider} />

              <Text style={s.summaryTitle}>📝 Issue</Text>
              <Text style={s.summaryValue}>
                {issueDescription || 'None Specified'}
              </Text>

              <View style={s.divider} />

              <Text style={s.summaryTitle}>📅 Date & Time</Text>
              <Text style={s.summaryValue}>
                {bookingDate ? formatDisplayDate(bookingDate) : 'None Specified'}{' '}
                at {bookingTime ? formatTimeSlot(bookingTime) : '—'}
              </Text>

              <View style={s.divider} />

              <Text style={s.summaryTitle}>👨‍🔧 Mechanic</Text>
              <Text style={s.summaryValue}>
                {selectedMechanic
                  ? `${selectedMechanic.first_name} ${selectedMechanic.last_name}`
                  : 'No Preference (system will auto-assign an available mechanic)'}
              </Text>

              <View style={s.divider} />

              <Text style={s.summaryTitle}>💰 Estimated Total</Text>
              <Text
                style={[
                  s.summaryValue,
                  {
                    color: theme.primaryLight,
                    fontSize: 20,
                    fontWeight: 'bold',
                  },
                ]}
              >
                ₱{servicesTotal.toLocaleString('en-PH')}
              </Text>

              <View style={s.divider} />

              <Text style={s.summaryTitle}>📲 Reservation Fee (20%)</Text>
              <Text
                style={[
                  s.summaryValue,
                  {
                    color: theme.primaryLight,
                    fontSize: 18,
                    fontWeight: 'bold',
                  },
                ]}
              >
                ₱{reservationFeePreview.toFixed(2)}
              </Text>

              <Text style={[s.summaryValue, { color: theme.textSub, fontSize: 12 }]}>
                Reservation fee must be settled before the shop confirms your booking.
              </Text>

              <View style={s.divider} />

              <Text style={s.summaryTitle}>💳 Payment Method</Text>

              {PAYMENT_METHODS.map((method) => (
                <TouchableOpacity
                  key={method.key}
                  style={[
                    s.paymentMethodCard,
                    paymentMethod === method.key && s.paymentMethodCardActive,
                  ]}
                  onPress={() => setPaymentMethod(method.key)}
                >
                  <Text style={s.paymentMethodIcon}>{method.icon}</Text>

                  <View style={{ flex: 1 }}>
                    <Text style={s.paymentMethodTitle}>{method.title}</Text>
                    <Text style={s.paymentMethodSubtitle}>{method.subtitle}</Text>
                  </View>

                  {paymentMethod === method.key && (
                    <Text style={s.checkmark}>✓</Text>
                  )}
                </TouchableOpacity>
              ))}

              {paymentMethod === 'gcash_manual' && (
                <View style={s.manualReferenceBox}>
                  <Text style={s.summaryTitle}>Personal GCash Payment Details</Text>

                  <View style={s.gcashAccountBox}>
                    <Text style={s.gcashAccountLabel}>GCash Number</Text>
                    <Text style={s.gcashAccountValue}>{PERSONAL_GCASH_NUMBER}</Text>

                    <Text style={s.gcashAccountLabel}>Account Name</Text>
                    <Text style={s.gcashAccountValue}>{PERSONAL_GCASH_NAME}</Text>
                  </View>

                  <Text style={s.manualReferenceHelp}>
                    Send the reservation fee to this GCash account, then enter the reference number below for staff verification.
                  </Text>

                  <Text style={s.summaryTitle}>GCash Reference Number</Text>
                  <TextInput
                    style={s.input}
                    placeholder="Enter GCash reference number"
                    placeholderTextColor={theme.textMuted}
                    value={manualReference}
                    onChangeText={(value) => setManualReference(sanitizeGcashReference(value))}
                    keyboardType="numeric"
                    maxLength={20}
                  />
                </View>
              )}
            </View>

            {notes ? (
              <View style={s.notesCard}>
                <Text style={s.summaryTitle}>📝 Notes</Text>
                <Text style={s.summaryValue}>{notes}</Text>
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={!!certModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setCertModal(null);
          setMechanicCerts([]);
        }}
      >
        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.6)',
            justifyContent: 'flex-end',
          }}
          activeOpacity={1}
          onPress={() => {
            setCertModal(null);
            setMechanicCerts([]);
          }}
        >
          <View
            style={{
              backgroundColor: theme.bg,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 20,
              maxHeight: '70%',
            }}
            onStartShouldSetResponder={() => true}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
              }}
            >
              <View>
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: 'bold',
                    color: theme.text,
                  }}
                >
                  🎓 Certificates
                </Text>

                <Text
                  style={{
                    fontSize: 12,
                    color: theme.textSub,
                    marginTop: 2,
                  }}
                >
                  {certModal?.first_name} {certModal?.last_name}
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => {
                  setCertModal(null);
                  setMechanicCerts([]);
                }}
              >
                <Text style={{ fontSize: 20, color: theme.textMuted }}>✕</Text>
              </TouchableOpacity>
            </View>

            {loadingCerts ? (
              <ActivityIndicator
                size="large"
                color={theme.primaryLight}
                style={{ marginVertical: 32 }}
              />
            ) : mechanicCerts.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                <Text style={{ fontSize: 36, marginBottom: 12 }}>📄</Text>

                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: 'bold',
                    color: theme.text,
                    marginBottom: 6,
                  }}
                >
                  No Certificates
                </Text>

                <Text
                  style={{
                    fontSize: 13,
                    color: theme.textSub,
                    textAlign: 'center',
                  }}
                >
                  This mechanic has no certificates on file yet.
                </Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {mechanicCerts.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: theme.card,
                      borderRadius: 12,
                      padding: 14,
                      marginBottom: 10,
                      borderWidth: 1,
                      borderColor: theme.border,
                    }}
                    onPress={() => Linking.openURL(c.file_url)}
                  >
                    <Text style={{ fontSize: 24, marginRight: 12 }}>📄</Text>

                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: '600',
                          color: theme.text,
                        }}
                      >
                        {c.name}
                      </Text>

                      <Text
                        style={{
                          fontSize: 11,
                          color: theme.textMuted,
                          marginTop: 2,
                        }}
                      >
                        Uploaded {new Date(c.created_at).toLocaleDateString()}
                      </Text>
                    </View>

                    <View
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 8,
                        backgroundColor: theme.primary + '18',
                        borderWidth: 1,
                        borderColor: theme.primary + '44',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          color: theme.primaryLight,
                          fontWeight: '600',
                        }}
                      >
                        View
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}

                <View style={{ height: 20 }} />
              </ScrollView>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      <View style={s.footer}>
        {step > 1 && (
          <TouchableOpacity style={s.backBtn} onPress={() => setStep(step - 1)}>
            <Text style={s.backBtnText}>← Back</Text>
          </TouchableOpacity>
        )}

        {step < TOTAL_STEPS ? (
          <TouchableOpacity
            style={[s.nextBtn, step === 1 && selectedServices.length === 0 && s.nextBtnDisabled]}
            onPress={handleNext}
          >
            <Text style={s.nextBtnText}>
              {step === 4 ? (selectedMechanic ? 'Next →' : 'Skip →') : 'Next →'}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={s.nextBtn}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.nextBtnText}>{paymentMethod === 'paymongo_qrph' ? 'Confirm Booking & Pay QR ✓' : 'Confirm Booking ✓'}</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = (theme) => StyleSheet.create({
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
  progressBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: theme.bg2,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  progressStep: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.bg3,
    borderWidth: 2,
    borderColor: theme.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressDotActive: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  progressNum: {
    color: theme.textMuted,
    fontWeight: 'bold',
    fontSize: 12,
  },
  progressNumActive: {
    color: '#fff',
  },
  progressLine: {
    width: 28,
    height: 2,
    backgroundColor: theme.border,
  },
  progressLineActive: {
    backgroundColor: theme.primary,
  },
  scrollContainer: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: theme.text,
    marginBottom: 6,
  },
  stepSub: {
    fontSize: 14,
    color: theme.textSub,
    marginBottom: 24,
  },
  serviceCard: {
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: theme.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  serviceCardActive: {
    borderColor: theme.primary,
    backgroundColor: theme.primary + '11',
  },
  serviceCardLeft: {
    flex: 1,
  },
  serviceCardName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.text,
    marginBottom: 4,
  },
  serviceCardDesc: {
    fontSize: 12,
    color: theme.textSub,
    marginBottom: 6,
  },
  serviceCardDuration: {
    fontSize: 12,
    color: theme.textMuted,
  },
  serviceCardRight: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  serviceCardPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.primaryLight,
  },
  checkmark: {
    color: theme.primary,
    fontSize: 20,
    fontWeight: 'bold',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textSub,
    marginBottom: 8,
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: theme.bg2,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: theme.text,
    marginBottom: 16,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  quickPicks: {
    marginBottom: 16,
    paddingVertical: 4,
  },
  quickPickChip: {
    backgroundColor: theme.bg2,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
  },
  quickPickText: {
    color: theme.text,
    fontSize: 13,
  },
  dateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.bg2,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  dateCardIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  dateCardText: {
    flex: 1,
    color: theme.text,
    fontSize: 15,
    fontWeight: '600',
  },
  dateCardPlaceholder: {
    flex: 1,
    color: theme.textMuted,
    fontSize: 15,
  },
  dateCardChevron: {
    color: theme.textMuted,
    fontSize: 20,
  },
  nativePicker: {
    alignSelf: 'stretch',
    marginBottom: 8,
  },
  dateDoneBtn: {
    alignSelf: 'flex-end',
    backgroundColor: theme.primary,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 16,
  },
  dateDoneBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
  },
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  timeChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: theme.bg2,
    borderWidth: 1,
    borderColor: theme.border,
  },
  timeChipActive: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  timeChipDisabled: {
    opacity: 0.45,
    backgroundColor: theme.bg3,
    borderColor: theme.border,
  },
  timeChipText: {
    color: theme.textSub,
    fontSize: 14,
  },
  timeChipTextDisabled: {
    color: theme.textMuted,
    textDecorationLine: 'line-through',
  },
  timeChipTextActive: {
    color: '#fff',
    fontWeight: 'bold',
  },
  mechanicCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: theme.border,
  },
  mechanicCardActive: {
    borderColor: theme.primary,
    backgroundColor: theme.primary + '11',
  },
  mechanicCardDisabled: {
    opacity: 0.6,
    backgroundColor: theme.bg2,
  },
  mechanicAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    marginRight: 14,
  },
  mechanicAvatarPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.bg3,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  mechanicAvatarEmoji: {
    fontSize: 22,
  },
  mechanicAvatarInitials: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.primaryLight,
  },
  mechanicInfo: {
    flex: 1,
  },
  mechanicName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: theme.text,
    marginBottom: 2,
  },
  mechanicSpec: {
    fontSize: 12,
    color: theme.textSub,
    marginBottom: 2,
  },
  mechanicRating: {
    fontSize: 12,
    color: theme.textMuted,
  },
  mechanicBookedText: {
    fontSize: 12,
    color: '#ff4d4d',
    marginTop: 4,
    fontWeight: '600',
  },
  certBtn: {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.primary + '44',
    backgroundColor: theme.primary + '15',
    alignSelf: 'flex-start',
  },
  certBtnText: {
    fontSize: 11,
    fontWeight: '600',
  },
  emptyMechanics: {
    padding: 20,
    alignItems: 'center',
  },
  emptyMechanicsText: {
    color: theme.textMuted,
    fontSize: 14,
  },
  optionalNote: {
    marginTop: 16,
    backgroundColor: theme.bg2,
    borderRadius: 10,
    padding: 14,
  },
  optionalNoteText: {
    color: theme.textSub,
    fontSize: 13,
    lineHeight: 18,
  },
  summaryCard: {
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.border,
  },
  summaryTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 15,
    color: theme.text,
    marginBottom: 12,
  },
  divider: {
    height: 1,
    backgroundColor: theme.border,
    marginBottom: 12,
  },
  notesCard: {
    backgroundColor: theme.bg2,
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  paymentMethodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.bg2,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: theme.border,
  },
  paymentMethodCardActive: {
    borderColor: theme.primary,
    backgroundColor: theme.primary + '11',
  },
  paymentMethodIcon: {
    fontSize: 22,
    marginRight: 12,
  },
  paymentMethodTitle: {
    color: theme.text,
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  paymentMethodSubtitle: {
    color: theme.textSub,
    fontSize: 12,
    lineHeight: 17,
  },
  manualReferenceBox: {
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: theme.bg2,
    borderWidth: 1,
    borderColor: theme.border,
  },
  gcashAccountBox: {
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.primary + '44',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  gcashAccountLabel: {
    color: theme.textMuted,
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  gcashAccountValue: {
    color: theme.primaryLight,
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  manualReferenceHelp: {
    color: theme.textSub,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 12,
  },
  selectedServicesBox: {
    backgroundColor: theme.primary + '10',
    borderWidth: 1,
    borderColor: theme.primary + '44',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  selectedServicesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 10,
  },
  selectedServicesTitle: {
    color: theme.text,
    fontWeight: 'bold',
    fontSize: 14,
  },
  selectedServicesTotal: {
    color: theme.primaryLight,
    fontWeight: 'bold',
    fontSize: 13,
  },
  selectedServiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: theme.border,
  },
  selectedServiceName: {
    color: theme.text,
    fontWeight: '700',
    fontSize: 13,
  },
  selectedServiceMeta: {
    color: theme.textSub,
    fontSize: 11,
    marginTop: 2,
  },
  removeServiceBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#EF444420',
    borderWidth: 1,
    borderColor: '#EF444455',
  },
  removeServiceText: {
    color: '#EF4444',
    fontWeight: 'bold',
    fontSize: 11,
  },
  selectedPill: {
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: theme.primary + '18',
    borderWidth: 1,
    borderColor: theme.primary + '55',
  },
  selectedPillText: {
    color: theme.primaryLight,
    fontWeight: 'bold',
    fontSize: 11,
  },
  addServiceText: {
    marginTop: 8,
    color: theme.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    padding: 20,
    backgroundColor: theme.bg,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    gap: 12,
  },
  backBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: theme.bg3,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.border,
  },
  backBtnText: {
    color: theme.text,
    fontSize: 15,
    fontWeight: 'bold',
  },
  nextBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: theme.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nextBtnDisabled: {
    backgroundColor: theme.primary + '55',
  },
  nextBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  checkingText: {
    fontSize: 13,
    color: theme.primaryLight,
    fontStyle: 'italic',
    marginBottom: 12,
    textAlign: 'center',
  },
  durationNotice: {
    fontSize: 12,
    color: theme.textSub,
    lineHeight: 17,
    marginBottom: 12,
    backgroundColor: theme.bg2,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: theme.border,
  },
});