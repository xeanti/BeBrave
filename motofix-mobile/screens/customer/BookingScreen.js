import React, { useEffect, useState } from 'react';
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

  const [selectedService, setSelectedService] = useState(null);
  const [motorcycleMake, setMotorcycleMake] = useState('');
  const [motorcycleModel, setMotorcycleModel] = useState('');
  const [motorcycleYear, setMotorcycleYear] = useState('');
  const [issueDescription, setIssueDescription] = useState('');
  const [bookingDate, setBookingDate] = useState(null);
  const [bookingTime, setBookingTime] = useState('');
  const [notes, setNotes] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedMechanic, setSelectedMechanic] = useState(null);

  const [bookedMechanicIds, setBookedMechanicIds] = useState([]);
  const [checkingAvailability, setCheckingAvailability] = useState(false);

  useEffect(() => {
    if (route?.params?.preselectedService) {
      setSelectedService(route.params.preselectedService);
      setStep(2);
    }
  }, [route?.params?.preselectedService]);

  useEffect(() => {
    fetchData();
  }, []);

useEffect(() => {
  if (step === 4 && bookingDate && bookingTime && selectedService) {
    fetchMechanicAvailability();
  }
}, [step, bookingDate, bookingTime, selectedService]);

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

  async function fetchMechanicAvailability() {
    setCheckingAvailability(true);

    const dateStr = toISODateString(bookingDate);

    const { data, error } = await supabase
      .from('bookings')
      .select('mechanic_id, booking_time, services(estimated_duration_minutes)')
      .eq('booking_date', dateStr)
        .in('status', [
          'pending',
          'confirmed',
          'in_progress',
          'inspection',
          'repairing',
          'quality_check',
          'ready_for_pickup',
        ])      .not('mechanic_id', 'is', null);

    if (!error && data) {
      const newStart = timeToMinutes(bookingTime);
      const newDuration = selectedService?.estimated_duration_minutes || 30;
      const newEnd = newStart + newDuration;

      const conflicting = data.filter((b) => {
        const start = timeToMinutes((b.booking_time || '').slice(0, 5));
        const duration = b.services?.estimated_duration_minutes || 30;
        const end = start + duration;

        return newStart < end && newEnd > start;
      });

      setBookedMechanicIds(conflicting.map((b) => b.mechanic_id));
    }

    setCheckingAvailability(false);
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

const consentsAccepted = await requireBookingConsents();

if (!consentsAccepted) {
  setSubmitting(false);
  return;
}

const bookingDateStr = toISODateString(bookingDate);

    if (selectedMechanic) {
      const { data: existingBookings } = await supabase
        .from('bookings')
        .select('booking_time, services(estimated_duration_minutes)')
        .eq('mechanic_id', selectedMechanic.id)
        .eq('booking_date', bookingDateStr)
        .in('status', [
            'pending',
            'confirmed',
            'in_progress',
            'inspection',
            'repairing',
            'quality_check',
            'ready_for_pickup',
          ]);

      const newStart = timeToMinutes(bookingTime);
      const newDuration = selectedService?.estimated_duration_minutes || 30;
      const newEnd = newStart + newDuration;

      const hasConflict = (existingBookings || []).some((b) => {
        const start = timeToMinutes((b.booking_time || '').slice(0, 5));
        const duration = b.services?.estimated_duration_minutes || 30;
        const end = start + duration;

        return newStart < end && newEnd > start;
      });

      if (hasConflict) {
        Alert.alert(
          'Mechanic Unavailable',
          'This mechanic was just booked for this time slot. Please choose another mechanic or time.'
        );

        setSubmitting(false);
        setStep(4);
        fetchMechanicAvailability();
        return;
      }
    }

    const { data: assessment, error: assessmentError } = await supabase
      .from('pre_assessments')
      .insert({
        customer_id: user.id,
        motorcycle_make: motorcycleMake,
        motorcycle_model: motorcycleModel,
        motorcycle_year: parseInt(motorcycleYear) || null,
        issue_description: issueDescription,
        service_id: selectedService.id,
        estimated_labor_cost: selectedService.labor_cost,
        estimated_total: selectedService.base_price,
        status: 'pending',
        notes,
      })
      .select()
      .single();

    if (assessmentError) {
      Alert.alert('Error', assessmentError.message);
      setSubmitting(false);
      return;
    }

const { data: rpcBooking, error: bookingError } = await supabase.rpc(
  'create_booking_with_conflict_check',
  {
    p_customer_id: user.id,
    p_service_id: selectedService.id,
    p_mechanic_id: selectedMechanic?.id || null,
    p_booking_date: bookingDateStr,
    p_booking_time: bookingTime,
    p_notes: notes || null,
    p_total_amount: selectedService.base_price,
  }
);

if (bookingError) {
  setSubmitting(false);

  const message = String(bookingError.message || '').toLowerCase();

  if (
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

const booking = Array.isArray(rpcBooking)
  ? rpcBooking[0]
  : rpcBooking;

if (!booking?.id) {
  setSubmitting(false);
  Alert.alert(
    'Booking Error',
    'Booking was processed but no booking ID was returned. Please check the database RPC return value.'
  );
  return;
}

    await notifyUser({
      userId: user.id,
      title: 'Booking Submitted',
      message: 'Your booking request has been submitted. Please wait for admin confirmation.',
      type: 'booking',
      relatedTable: 'bookings',
      relatedId: booking.id,
    });

    await notifyRole({
      role: 'admin',
      title: 'New Booking Request',
      message: 'A customer submitted a new service booking request from the mobile app.',
      type: 'booking',
      relatedTable: 'bookings',
      relatedId: booking.id,
    });

    await notifyRole({
  role: 'staff',
  title: 'New Booking Request',
  message: 'A customer submitted a new service booking request from the mobile app.',
  type: 'booking',
  relatedTable: 'bookings',
  relatedId: booking.id,
});

    if (selectedMechanic?.id) {
      await notifyUser({
        userId: selectedMechanic.id,
        title: 'New Assigned Booking',
        message: 'A customer selected you for a new pending booking.',
        type: 'booking',
        relatedTable: 'bookings',
        relatedId: booking.id,
      });
    }

    setSubmitting(false);

Alert.alert(
  'Booking Submitted!',
  'Your booking request has been submitted.\nPlease wait for shop confirmation.',
  [{ text: 'OK', onPress: () => navigation.goBack() }]
);
  }

  function handleNext() {
    if (step === 1 && !selectedService) {
      Alert.alert('Error', 'Please select a service.');
      return;
    }

    if (step === 2 && (!motorcycleMake || !motorcycleModel)) {
      Alert.alert('Error', 'Please enter your motorcycle make and model.');
      return;
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
            <Text style={s.stepTitle}>Select a Service</Text>
            <Text style={s.stepSub}>Choose the service you need</Text>

            {services.map((sv) => (
              <TouchableOpacity
                key={sv.id}
                style={[
                  s.serviceCard,
                  selectedService?.id === sv.id && s.serviceCardActive,
                ]}
                onPress={() => setSelectedService(sv)}
              >
                <View style={s.serviceCardLeft}>
                  <Text style={s.serviceCardName}>{sv.name}</Text>
                  <Text style={s.serviceCardDesc}>{sv.description}</Text>
                  <Text style={s.serviceCardDuration}>
                    ⏱ {sv.estimated_duration_minutes} mins
                  </Text>
                </View>

                <View style={s.serviceCardRight}>
                  <Text style={s.serviceCardPrice}>₱{sv.base_price}</Text>
                  {selectedService?.id === sv.id && (
                    <Text style={s.checkmark}>✓</Text>
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
              onChangeText={setMotorcycleMake}
            />

            <Text style={s.label}>Model</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. CBR500R, MT-07"
              placeholderTextColor={theme.textMuted}
              value={motorcycleModel}
              onChangeText={setMotorcycleModel}
            />

            <Text style={s.label}>Year</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. 2022"
              placeholderTextColor={theme.textMuted}
              value={motorcycleYear}
              onChangeText={setMotorcycleYear}
              keyboardType="numeric"
            />

            <Text style={s.label}>Issue Description</Text>
            <TextInput
              style={[s.input, s.textArea]}
              placeholder="Describe what is wrong with your motorcycle..."
              placeholderTextColor={theme.textMuted}
              value={issueDescription}
              onChangeText={setIssueDescription}
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
                        setMotorcycleMake(m.make);
                        setMotorcycleModel(m.model);
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

            <View style={s.timeGrid}>
              {timeSlots.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[s.timeChip, bookingTime === t && s.timeChipActive]}
                  onPress={() => setBookingTime(t)}
                >
                  <Text
                    style={[
                      s.timeChipText,
                      bookingTime === t && s.timeChipTextActive,
                    ]}
                  >
                    {formatTimeSlot(t)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.label}>Additional Notes (optional)</Text>

            <TextInput
              style={[s.input, s.textArea]}
              placeholder="Any other details..."
              placeholderTextColor={theme.textMuted}
              value={notes}
              onChangeText={setNotes}
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
                  We'll assign the best available mechanic
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
              <Text style={s.summaryTitle}>🔧 Service</Text>
              <Text style={s.summaryValue}>{selectedService?.name}</Text>

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
                  : 'No Preference (Auto-assigned)'}
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
                ₱{selectedService?.base_price}
              </Text>
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
            style={[s.nextBtn, step === 1 && !selectedService && s.nextBtnDisabled]}
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
              <Text style={s.nextBtnText}>Confirm Booking ✓</Text>
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
  timeChipText: {
    color: theme.textSub,
    fontSize: 14,
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
});