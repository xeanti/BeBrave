import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, StatusBar, Alert, Platform, Image
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';

const TOTAL_STEPS = 5;

export default function BookingScreen({ navigation }) {
  const { theme, isDark } = useTheme();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Data
  const [services, setServices] = useState([]);
  const [motorcycleModels, setMotorcycleModels] = useState([]);
  const [mechanics, setMechanics] = useState([]);

  // Form state
  const [selectedService, setSelectedService] = useState(null);
  const [motorcycleMake, setMotorcycleMake] = useState('');
  const [motorcycleModel, setMotorcycleModel] = useState('');
  const [motorcycleYear, setMotorcycleYear] = useState('');
  const [issueDescription, setIssueDescription] = useState('');
  const [bookingDate, setBookingDate] = useState(null);
  const [bookingTime, setBookingTime] = useState('');
  const [notes, setNotes] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedMechanic, setSelectedMechanic] = useState(null); // null = no preference

  const timeSlots = [
    '08:00 AM', '09:00 AM', '10:00 AM', '11:00 AM',
    '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM',
  ];

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);

    try {
      const { data: s, error: serviceError } = await supabase
        .from('services')
        .select('*')
        .eq('is_active', true);

      console.log("SERVICES:", s);
      console.log("SERVICE ERROR:", serviceError);

      const { data: m, error: modelError } = await supabase
        .from('motorcycle_models')
        .select('*')
        .order('make');

      console.log("MODELS:", m);
      console.log("MODEL ERROR:", modelError);

      // Streamlined selection pulling all columns for mechanics
      const { data: mech, error: mechError } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'mechanic');

      console.log("MECHANICS:", mech);
      console.log("MECHANIC ERROR:", mechError);

      setServices(s || []);
      setMotorcycleModels(m || []);
      setMechanics(mech || []);
    } catch (err) {
      console.log("FETCH ERROR:", err);
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
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    });
  }

  function onChangeDate(event, selectedDate) {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
      if (event.type === 'set' && selectedDate) setBookingDate(selectedDate);
    } else {
      if (selectedDate) setBookingDate(selectedDate);
    }
  }

  async function handleSubmit() {
    if (!bookingDate) { Alert.alert('Error', 'Please select a booking date.'); return; }
    if (!bookingTime) { Alert.alert('Error', 'Please select a time slot.'); return; }

    setSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();
    const bookingDateStr = toISODateString(bookingDate);

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

    const { error: bookingError } = await supabase
      .from('bookings')
      .insert({
        customer_id: user.id,
        service_id: selectedService.id,
        mechanic_id: selectedMechanic?.id || null, // null = no preference / auto-assign
        booking_date: bookingDateStr,
        booking_time: bookingTime,
        status: 'pending',
        notes,
        total_amount: selectedService.base_price,
      });

    setSubmitting(false);

    if (bookingError) {
      Alert.alert('Error', bookingError.message);
    } else {
      Alert.alert('Booking Confirmed! 🎉', 'Your booking has been submitted. We will confirm shortly.', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    }
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

  if (loading) return (
    <View style={s.centered}>
      <ActivityIndicator size="large" color={theme.primaryLight} />
    </View>
  );

  return (
    <View style={s.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.bg} />

      {/* Progress Bar */}
      <View style={s.progressBar}>
        {[1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={s.progressStep}>
            <View style={[s.progressDot, step >= i && s.progressDotActive]}>
              <Text style={[s.progressNum, step >= i && s.progressNumActive]}>{i}</Text>
            </View>
            {i < TOTAL_STEPS && <View style={[s.progressLine, step > i && s.progressLineActive]} />}
          </View>
        ))}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        style={s.scrollContainer}
        contentContainerStyle={s.content}
      >

        {/* STEP 1 - Select Service */}
        {step === 1 && (
          <View>
            <Text style={s.stepTitle}>Select a Service</Text>
            <Text style={s.stepSub}>Choose the service you need</Text>
            {services.map((sv) => (
              <TouchableOpacity
                key={sv.id}
                style={[s.serviceCard, selectedService?.id === sv.id && s.serviceCardActive]}
                onPress={() => setSelectedService(sv)}
              >
                <View style={s.serviceCardLeft}>
                  <Text style={s.serviceCardName}>{sv.name}</Text>
                  <Text style={s.serviceCardDesc}>{sv.description}</Text>
                  <Text style={s.serviceCardDuration}>⏱ {sv.estimated_duration_minutes} mins</Text>
                </View>
                <View style={s.serviceCardRight}>
                  <Text style={s.serviceCardPrice}>₱{sv.base_price}</Text>
                  {selectedService?.id === sv.id && <Text style={s.checkmark}>✓</Text>}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* STEP 2 - Motorcycle Details */}
        {step === 2 && (
          <View>
            <Text style={s.stepTitle}>Motorcycle Details</Text>
            <Text style={s.stepSub}>Tell us about your bike</Text>

            <Text style={s.label}>Make</Text>
            <TextInput style={s.input} placeholder="e.g. Honda, Yamaha, Kawasaki"
              placeholderTextColor={theme.textMuted} value={motorcycleMake}
              onChangeText={setMotorcycleMake} />

            <Text style={s.label}>Model</Text>
            <TextInput style={s.input} placeholder="e.g. CBR500R, MT-07"
              placeholderTextColor={theme.textMuted} value={motorcycleModel}
              onChangeText={setMotorcycleModel} />

            <Text style={s.label}>Year</Text>
            <TextInput style={s.input} placeholder="e.g. 2022"
              placeholderTextColor={theme.textMuted} value={motorcycleYear}
              onChangeText={setMotorcycleYear} keyboardType="numeric" />

            <Text style={s.label}>Issue Description</Text>
            <TextInput style={[s.input, s.textArea]}
              placeholder="Describe what is wrong with your motorcycle..."
              placeholderTextColor={theme.textMuted} value={issueDescription}
              onChangeText={setIssueDescription} multiline numberOfLines={4} />

            {motorcycleModels.length > 0 && (
              <View style={{ marginTop: 8 }}>
                <Text style={s.label}>Quick Pick (from our database)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.quickPicks}>
                  {motorcycleModels.map((m) => (
                    <TouchableOpacity key={m.id} style={s.quickPickChip}
                      onPress={() => { setMotorcycleMake(m.make); setMotorcycleModel(m.model); }}>
                      <Text style={s.quickPickText}>{m.make} {m.model}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
        )}

        {/* STEP 3 - Date & Time */}
        {step === 3 && (
          <View>
            <Text style={s.stepTitle}>Schedule</Text>
            <Text style={s.stepSub}>Pick your preferred date and time</Text>

            <Text style={s.label}>Booking Date</Text>
            <TouchableOpacity style={s.dateCard} onPress={() => setShowDatePicker(true)} activeOpacity={0.7}>
              <Text style={s.dateCardIcon}>📅</Text>
              <Text style={bookingDate ? s.dateCardText : s.dateCardPlaceholder}>
                {bookingDate ? formatDisplayDate(bookingDate) : 'Tap to choose a date'}
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
              <TouchableOpacity style={s.dateDoneBtn} onPress={() => setShowDatePicker(false)}>
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
                  <Text style={[s.timeChipText, bookingTime === t && s.timeChipTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.label}>Additional Notes (optional)</Text>
            <TextInput style={[s.input, s.textArea]} placeholder="Any other details..."
              placeholderTextColor={theme.textMuted} value={notes}
              onChangeText={setNotes} multiline numberOfLines={3} />
          </View>
        )}

        {/* STEP 4 - Choose Mechanic (Optional) */}
        {step === 4 && (
          <View>
            <Text style={s.stepTitle}>Choose a Mechanic</Text>
            <Text style={s.stepSub}>Optional — or let us assign one for you</Text>

            <TouchableOpacity
              style={[s.mechanicCard, selectedMechanic === null && s.mechanicCardActive]}
              onPress={() => setSelectedMechanic(null)}
            >
              <View style={s.mechanicAvatarPlaceholder}>
                <Text style={s.mechanicAvatarEmoji}>🔧</Text>
              </View>
              <View style={s.mechanicInfo}>
                <Text style={s.mechanicName}>No Preference</Text>
                <Text style={s.mechanicSpec}>We'll assign the best available mechanic</Text>
              </View>
              {selectedMechanic === null && <Text style={s.checkmark}>✓</Text>}
            </TouchableOpacity>

            {mechanics.length === 0 ? (
              <View style={s.emptyMechanics}>
                <Text style={s.emptyMechanicsText}>No mechanics listed yet.</Text>
              </View>
            ) : (
              mechanics.map((mech) => (
                <TouchableOpacity
                  key={mech.id}
                  style={[s.mechanicCard, selectedMechanic?.id === mech.id && s.mechanicCardActive]}
                  onPress={() => setSelectedMechanic(mech)}
                >
                  {mech.mechanic_photo_url ? (
                    <Image source={{ uri: mech.mechanic_photo_url }} style={s.mechanicAvatar} />
                  ) : (
                    <View style={s.mechanicAvatarPlaceholder}>
                      <Text style={s.mechanicAvatarInitials}>
                        {mech.first_name?.[0]}{mech.last_name?.[0]}
                      </Text>
                    </View>
                  )}
                  <View style={s.mechanicInfo}>
                    <Text style={s.mechanicName}>{mech.first_name} {mech.last_name}</Text>
                    {mech.specialization ? (
                      <Text style={s.mechanicSpec}>{mech.specialization}</Text>
                    ) : null}
                    {mech.rating_avg != null ? (
                      <Text style={s.mechanicRating}>⭐ {Number(mech.rating_avg).toFixed(1)}</Text>
                    ) : null}
                  </View>
                  {selectedMechanic?.id === mech.id && <Text style={s.checkmark}>✓</Text>}
                </TouchableOpacity>
              ))
            )}

            <View style={s.optionalNote}>
              <Text style={s.optionalNoteText}>
                💡 Selecting a mechanic is optional. Availability is subject to scheduling.
              </Text>
            </View>
          </View>
        )}

        {/* STEP 5 - Confirm */}
        {step === 5 && (
          <View>
            <Text style={s.stepTitle}>Confirm Booking</Text>
            <Text style={s.stepSub}>Review your booking details</Text>

            <View style={s.summaryCard}>
              <Text style={s.summaryTitle}>🔧 Service</Text>
              <Text style={s.summaryValue}>{selectedService?.name}</Text>
              <View style={s.divider} />

              <Text style={s.summaryTitle}>🏍️ Motorcycle</Text>
              <Text style={s.summaryValue}>{motorcycleMake} {motorcycleModel} {motorcycleYear}</Text>
              <View style={s.divider} />

              <Text style={s.summaryTitle}>📝 Issue</Text>
              <Text style={s.summaryValue}>{issueDescription || 'None Specified'}</Text>
              <View style={s.divider} />

              <Text style={s.summaryTitle}>📅 Date & Time</Text>
              <Text style={s.summaryValue}>
                {bookingDate ? formatDisplayDate(bookingDate) : 'None Specified'} at {bookingTime}
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
              <Text style={[s.summaryValue, { color: theme.primaryLight, fontSize: 20, fontWeight: 'bold' }]}>
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

      {/* Footer */}
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
          <TouchableOpacity style={s.nextBtn} onPress={handleSubmit} disabled={submitting}>
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.nextBtnText}>Confirm Booking ✓</Text>
            }
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg },
  progressBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: theme.bg2, borderBottomWidth: 1, borderBottomColor: theme.border },
  progressStep: { flexDirection: 'row', alignItems: 'center' },
  progressDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: theme.bg3, borderWidth: 2, borderColor: theme.border, justifyContent: 'center', alignItems: 'center' },
  progressDotActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  progressNum: { color: theme.textMuted, fontWeight: 'bold', fontSize: 12 },
  progressNumActive: { color: '#fff' },
  progressLine: { width: 28, height: 2, backgroundColor: theme.border },
  progressLineActive: { backgroundColor: theme.primary },
  scrollContainer: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  stepTitle: { fontSize: 22, fontWeight: 'bold', color: theme.text, marginBottom: 6 },
  stepSub: { fontSize: 14, color: theme.textSub, marginBottom: 24 },
  serviceCard: { backgroundColor: theme.card, borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 2, borderColor: theme.border, flexDirection: 'row', justifyContent: 'space-between' },
  serviceCardActive: { borderColor: theme.primary, backgroundColor: theme.primary + '11' },
  serviceCardLeft: { flex: 1 },
  serviceCardName: { fontSize: 16, fontWeight: 'bold', color: theme.text, marginBottom: 4 },
  serviceCardDesc: { fontSize: 12, color: theme.textSub, marginBottom: 6 },
  serviceCardDuration: { fontSize: 12, color: theme.textMuted },
  serviceCardRight: { alignItems: 'flex-end', justifyContent: 'space-between' },
  serviceCardPrice: { fontSize: 16, fontWeight: 'bold', color: theme.primaryLight },
  checkmark: { color: theme.primary, fontSize: 20, fontWeight: 'bold' },
  label: { fontSize: 13, fontWeight: '600', color: theme.textSub, marginBottom: 8, marginTop: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border, borderRadius: 12, padding: 14, fontSize: 15, color: theme.text, marginBottom: 16 },
  textArea: { height: 100, textAlignVertical: 'top' },
  quickPicks: { marginBottom: 16, paddingVertical: 4 },
  quickPickChip: { backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8 },
  quickPickText: { color: theme.text, fontSize: 13 },
  dateCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border, borderRadius: 12, padding: 14, marginBottom: 16 },
  dateCardIcon: { fontSize: 18, marginRight: 10 },
  dateCardText: { flex: 1, color: theme.text, fontSize: 15, fontWeight: '600' },
  dateCardPlaceholder: { flex: 1, color: theme.textMuted, fontSize: 15 },
  dateCardChevron: { color: theme.textMuted, fontSize: 20 },
  nativePicker: { alignSelf: 'stretch', marginBottom: 8 },
  dateDoneBtn: { alignSelf: 'flex-end', backgroundColor: theme.primary, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8, marginBottom: 16 },
  dateDoneBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  timeChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border },
  timeChipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  timeChipText: { color: theme.textSub, fontSize: 14 },
  timeChipTextActive: { color: '#fff', fontWeight: 'bold' },
  mechanicCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.card, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 2, borderColor: theme.border },
  mechanicCardActive: { borderColor: theme.primary, backgroundColor: theme.primary + '11' },
  mechanicAvatar: { width: 52, height: 52, borderRadius: 26, marginRight: 14 },
  mechanicAvatarPlaceholder: { width: 52, height: 52, borderRadius: 26, backgroundColor: theme.bg3, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  mechanicAvatarEmoji: { fontSize: 22 },
  mechanicAvatarInitials: { fontSize: 18, fontWeight: 'bold', color: theme.primaryLight },
  mechanicInfo: { flex: 1 },
  mechanicName: { fontSize: 15, fontWeight: 'bold', color: theme.text, marginBottom: 2 },
  mechanicSpec: { fontSize: 12, color: theme.textSub, marginBottom: 2 },
  mechanicRating: { fontSize: 12, color: theme.textMuted },
  emptyMechanics: { padding: 20, alignItems: 'center' },
  emptyMechanicsText: { color: theme.textMuted, fontSize: 14 },
  optionalNote: { marginTop: 16, backgroundColor: theme.bg2, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: theme.border },
  optionalNoteText: { fontSize: 13, color: theme.textSub, lineHeight: 20 },
  summaryCard: { backgroundColor: theme.card, borderRadius: 12, padding: 20, borderWidth: 1, borderColor: theme.border, marginBottom: 12 },
  summaryTitle: { fontSize: 12, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  summaryValue: { fontSize: 15, color: theme.text, marginBottom: 12 },
  divider: { height: 1, backgroundColor: theme.border, marginBottom: 12 },
  notesCard: { backgroundColor: theme.card, borderRadius: 12, padding: 20, borderWidth: 1, borderColor: theme.border, marginBottom: 16 },
  footer: { flexDirection: 'row', padding: 16, gap: 12, backgroundColor: theme.bg2, borderTopWidth: 1, borderTopColor: theme.border, alignItems: 'center' },
  backBtn: { flex: 1, borderWidth: 1, borderColor: theme.border, borderRadius: 12, padding: 16, alignItems: 'center', justifyContent: 'center' },
  backBtnText: { color: theme.text, fontWeight: '600', fontSize: 15 },
  nextBtn: { flex: 2, backgroundColor: theme.primary, borderRadius: 12, padding: 16, alignItems: 'center', justifyContent: 'center' },
  nextBtnDisabled: { backgroundColor: theme.bg3 },
  nextBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});