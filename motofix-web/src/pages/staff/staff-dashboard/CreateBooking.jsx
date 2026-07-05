import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import CustomerPicker from '../../../components/CustomerPicker';

import {
  Banner,
  Section,
  StatCard,
  TIME_SLOTS,
  formatPeso,
  formatTime,
  getCustomerName,
} from './StaffDashboardShared';

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getMinutesFromTime(time) {
  if (!time) return 0;

  const [hour = 0, minute = 0] = String(time).slice(0, 5).split(':').map(Number);
  return hour * 60 + minute;
}

function isElapsedTodayTime(date, time) {
  if (!date || !time) return false;

  const today = getLocalDateString();
  if (date !== today) return false;

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  return getMinutesFromTime(time) <= nowMinutes;
}

function sanitizeText(value, maxLength = 120, { allowNewLines = false } = {}) {
  const text = String(value || '')
    .replace(/[<>`{}]/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');

  const normalized = allowNewLines
    ? text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n')
    : text.replace(/\s+/g, ' ');

  return normalized.trimStart().slice(0, maxLength);
}

function sanitizeNotes(value) {
  return sanitizeText(value, 400, { allowNewLines: true });
}

function sanitizeSearch(value) {
  return sanitizeText(value, 100).trim().toLowerCase();
}

function sanitizeSearchInput(value) {
  return sanitizeText(value, 100);
}

function sanitizeId(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
}

function sanitizeDate(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function sanitizeTime(value) {
  const text = String(value || '').slice(0, 5);
  return /^\d{2}:\d{2}$/.test(text) ? text : '';
}

function sanitizeServiceIds(value) {
  const source = Array.isArray(value) ? value : value ? [value] : [];

  return [...new Set(source.map(sanitizeId).filter(Boolean))].slice(0, 10);
}

function sanitizeDraftParts(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => ({
      ...item,
      id: sanitizeId(item?.id),
      name: sanitizeText(item?.name || 'Product', 100),
      category: sanitizeText(item?.category || 'General', 60),
      price: Math.max(Number(item?.price) || 0, 0),
      stock_quantity: Math.max(parseInt(item?.stock_quantity || 0, 10) || 0, 0),
      quantity: Math.max(parseInt(item?.quantity || 1, 10) || 1, 1),
    }))
    .filter((item) => item.id && item.quantity > 0)
    .slice(0, 30);
}

function getServicePrice(service) {
  return (Number(service?.base_price) || 0) + (Number(service?.labor_cost) || 0);
}

function getServicesTotal(serviceList = []) {
  return serviceList.reduce((sum, service) => sum + getServicePrice(service), 0);
}

function getServicesDuration(serviceList = []) {
  return serviceList.reduce(
    (sum, service) => sum + (Number(service?.estimated_duration_minutes) || 0),
    0
  );
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

function getSafeDuration(serviceList = []) {
  return Math.max(30, getServicesDuration(serviceList) || 30);
}


function getServicesSummary(serviceList = []) {
  if (!serviceList.length) return '—';
  return serviceList.map((service) => service.name).join(', ');
}

function getMechanicName(mechanic) {
  const name = `${mechanic?.first_name || ''} ${mechanic?.last_name || ''}`.trim();
  return name || 'Mechanic';
}

function ProductImage({ product }) {
  if (product?.image_url) {
    return (
      <img
        src={product.image_url}
        alt={product.name || 'Product'}
        className="h-12 w-12 rounded-2xl object-cover ring-1 ring-gray-200 dark:ring-dark-700"
      />
    );
  }

  return (
    <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gray-100 text-xl ring-1 ring-gray-200 dark:bg-dark-900 dark:ring-dark-700">
      📦
    </div>
  );
}

const CREATE_BOOKING_DRAFT_KEY = 'motofix_staff_create_booking_draft';

function readCreateBookingDraft() {
  try {
    const raw = localStorage.getItem(CREATE_BOOKING_DRAFT_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveCreateBookingDraft(draft) {
  try {
    localStorage.setItem(CREATE_BOOKING_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Ignore browser storage errors.
  }
}

function clearCreateBookingDraft() {
  try {
    localStorage.removeItem(CREATE_BOOKING_DRAFT_KEY);
  } catch {
    // Ignore browser storage errors.
  }
}

export default function CreateBooking({ staffId }) {
  const today = getLocalDateString();
  const draft = readCreateBookingDraft();

  const [customer, setCustomer] = useState(() => draft.customer || null);
  const [services, setServices] = useState([]);
  const [parts, setParts] = useState([]);
  const [mechanics, setMechanics] = useState([]);

  const [serviceIds, setServiceIds] = useState(() => sanitizeServiceIds(draft.serviceIds || draft.serviceId));
  const [mechanicId, setMechanicId] = useState(() => sanitizeId(draft.mechanicId));
  const [bookingDate, setBookingDate] = useState(() => sanitizeDate(draft.bookingDate));
  const [bookingTime, setBookingTime] = useState(() => sanitizeTime(draft.bookingTime));
  const [notes, setNotes] = useState(() => sanitizeNotes(draft.notes));

  const [partSearch, setPartSearch] = useState(() => sanitizeSearchInput(draft.partSearch));
  const [partsUsed, setPartsUsed] = useState(() => sanitizeDraftParts(draft.partsUsed));

  const [scheduleRows, setScheduleRows] = useState([]);
  const [slotAvailability, setSlotAvailability] = useState({});
  const [loading, setLoading] = useState(true);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [createdBooking, setCreatedBooking] = useState(null);

  const selectedServices = services.filter((service) => serviceIds.includes(service.id));
  const selectedService = selectedServices[0] || null;
  const serviceTotal = getServicesTotal(selectedServices);
  const servicesDuration = getServicesDuration(selectedServices);
  const servicesSummary = getServicesSummary(selectedServices);

  const partsTotal = partsUsed.reduce(
    (sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 1),
    0
  );

  const totalBill = serviceTotal + partsTotal;
  const reservationFee = Number((serviceTotal * 0.2).toFixed(2));

  useEffect(() => {
    fetchSetup();

    const channel = supabase
      .channel('staff-create-booking-setup')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'services' }, () => fetchSetup(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parts' }, () => fetchSetup(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => fetchSetup(false))
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  useEffect(() => {
    const hasDraft =
      customer ||
      serviceIds.length > 0 ||
      mechanicId ||
      bookingDate ||
      bookingTime ||
      notes.trim() ||
      partSearch.trim() ||
      partsUsed.length > 0;

    if (!hasDraft) {
      clearCreateBookingDraft();
      return;
    }

    saveCreateBookingDraft({
      customer,
      serviceIds: sanitizeServiceIds(serviceIds),
      mechanicId: sanitizeId(mechanicId),
      bookingDate: sanitizeDate(bookingDate),
      bookingTime: sanitizeTime(bookingTime),
      notes: sanitizeNotes(notes),
      partSearch: sanitizeSearchInput(partSearch),
      partsUsed: sanitizeDraftParts(partsUsed),
      updatedAt: new Date().toISOString(),
    });
  }, [customer, serviceIds, mechanicId, bookingDate, bookingTime, notes, partSearch, partsUsed]);

  useEffect(() => {
    if (!bookingDate) {
      setScheduleRows([]);
      return;
    }

    fetchSchedule();

    const channel = supabase
      .channel(`staff-create-booking-schedule-${bookingDate}-${mechanicId || 'any'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, fetchSchedule)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [bookingDate, mechanicId]);

  useEffect(() => {
    if (!bookingDate || selectedServices.length === 0) {
      setSlotAvailability({});
      return;
    }

    fetchSlotAvailability();
  }, [bookingDate, mechanicId, selectedServices.length, servicesDuration, mechanics.length]);

  async function fetchSetup(showLoader = true) {
    if (showLoader) setLoading(true);

    try {
      const [servicesResult, partsResult, mechanicsResult] = await Promise.all([
        supabase
          .from('services')
          .select('id, name, base_price, labor_cost, estimated_duration_minutes, is_active')
          .eq('is_active', true)
          .order('name', { ascending: true }),
        supabase
          .from('parts')
          .select('id, name, category, image_url, price, stock_quantity, is_active')
          .eq('is_active', true)
          .gt('stock_quantity', 0)
          .order('name', { ascending: true }),
        supabase
          .from('profiles')
          .select('id, first_name, last_name, specialization')
          .eq('role', 'mechanic')
          .order('first_name', { ascending: true }),
      ]);

      const firstError = [servicesResult, partsResult, mechanicsResult].find((result) => result.error)?.error;

      if (firstError) {
        setMessage(`Error: ${firstError.message || 'Failed to load booking setup.'}`);
      }

      setServices(servicesResult.data || []);
      setParts(partsResult.data || []);
      setMechanics(mechanicsResult.data || []);
    } catch (err) {
      setMessage(`Error: ${err.message || 'Failed to load booking setup.'}`);
      setServices([]);
      setParts([]);
      setMechanics([]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchSchedule() {
    if (!bookingDate) return;

    setScheduleLoading(true);

    let query = supabase
      .from('bookings')
      .select(`
        id,
        booking_date,
        booking_time,
        status,
        mechanic_id,
        estimated_duration_minutes,
        services(name, estimated_duration_minutes),
        booking_services(estimated_duration_minutes, quantity),
        profiles!bookings_customer_id_fkey(first_name, last_name, phone, email),
        mechanic:profiles!bookings_mechanic_id_fkey(first_name, last_name)
      `)
      .eq('booking_date', bookingDate)
      .or('is_walkin.is.null,is_walkin.eq.false')
      .in('status', [
        'pending',
        'confirmed',
        'in_progress',
        'inspection',
        'repairing',
        'quality_check',
        'ready_for_pickup',
      ])
      .order('booking_time', { ascending: true });

    if (mechanicId) {
      query = query.eq('mechanic_id', mechanicId);
    }

    const { data, error } = await query;

    if (error) {
      setMessage(`Error: ${error.message || 'Failed to load schedule.'}`);
      setScheduleRows([]);
    } else {
      setScheduleRows(data || []);
    }

    setScheduleLoading(false);
  }


  async function fetchSlotAvailability() {
    if (!bookingDate || selectedServices.length === 0) {
      setSlotAvailability({});
      return;
    }

    setAvailabilityLoading(true);

    try {
      const durationMinutes = getSafeDuration(selectedServices);
      const results = await Promise.all(
        TIME_SLOTS.map(async (slot) => {
          if (isElapsedTodayTime(bookingDate, slot)) {
            return {
              slot,
              available: false,
              reason: 'Elapsed',
            };
          }

          try {
            if (mechanicId) {
              const availability = await checkBookingSlotAvailable({
                bookingDate,
                bookingTime: slot,
                durationMinutes,
                mechanicId,
              });

              return {
                slot,
                available: availability.available,
                reason: availability.available ? '' : 'Overlapping booking',
              };
            }

            if (mechanics.length > 0) {
              const mechanicChecks = await Promise.all(
                mechanics.map(async (mechanic) => {
                  const availability = await checkBookingSlotAvailable({
                    bookingDate,
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

              const hasAvailableMechanic = mechanicChecks.some((item) => item.available);

              return {
                slot,
                available: hasAvailableMechanic,
                reason: hasAvailableMechanic ? '' : 'All mechanics booked',
              };
            }

            const shopAvailability = await checkBookingSlotAvailable({
              bookingDate,
              bookingTime: slot,
              durationMinutes,
              mechanicId: null,
            });

            return {
              slot,
              available: shopAvailability.available,
              reason: shopAvailability.available ? '' : 'Overlapping booking',
            };
          } catch (error) {
            return {
              slot,
              available: true,
              reason: '',
            };
          }
        })
      );

      setSlotAvailability(
        results.reduce((map, item) => {
          map[item.slot] = item;
          return map;
        }, {})
      );
    } finally {
      setAvailabilityLoading(false);
    }
  }

  async function findAvailableMechanicForSlot({ date, time, durationMinutes }) {
    if (mechanics.length === 0) return null;

    const results = await Promise.all(
      mechanics.map(async (mechanic) => {
        try {
          const availability = await checkBookingSlotAvailable({
            bookingDate: date,
            bookingTime: time,
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

    return results.find((item) => item.available)?.mechanic || null;
  }


  const filteredParts = useMemo(() => {
    const query = sanitizeSearch(partSearch);

    if (!query) return parts.slice(0, 8);

    return parts
      .filter((part) => {
        const haystack = [
          part.name,
          part.category,
          part.description,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return haystack.includes(query);
      })
      .slice(0, 12);
  }, [parts, partSearch]);

  const availableSlots = TIME_SLOTS.map((slot) => {
    const elapsed = isElapsedTodayTime(bookingDate, slot);
    const availability = slotAvailability[slot];
    const durationBlocked = availability?.available === false;

    return {
      slot,
      disabled: elapsed || durationBlocked,
      reason: elapsed ? 'Elapsed' : durationBlocked ? availability?.reason || 'Overlapping booking' : '',
    };
  });

  function hasDraftContent() {
    return Boolean(
      customer ||
        serviceIds.length > 0 ||
        mechanicId ||
        bookingDate ||
        bookingTime ||
        notes.trim() ||
        partSearch.trim() ||
        partsUsed.length > 0
    );
  }

  function resetForm({ askConfirmation = true } = {}) {
    if (
      askConfirmation &&
      hasDraftContent() &&
      !window.confirm('Clear this scheduled booking draft? Unsaved customer, service, schedule, notes, and products used will be removed.')
    ) {
      return;
    }

    setCustomer(null);
    setServiceIds([]);
    setMechanicId('');
    setBookingDate('');
    setBookingTime('');
    setNotes('');
    setPartSearch('');
    setPartsUsed([]);
    setCreatedBooking(null);
    clearCreateBookingDraft();
    setMessage('');
  }

  function getPartQty(partId) {
    return partsUsed.find((item) => item.id === partId)?.quantity || 0;
  }

  function addPart(part) {
    setMessage('');

    const cleanPart = {
      ...part,
      id: sanitizeId(part?.id),
      name: sanitizeText(part?.name || 'Product', 100),
      category: sanitizeText(part?.category || 'General', 60),
      price: Math.max(Number(part?.price) || 0, 0),
      stock_quantity: Math.max(parseInt(part?.stock_quantity || 0, 10) || 0, 0),
    };

    const stock = cleanPart.stock_quantity;

    if (!cleanPart.id) {
      setMessage('Error: Invalid product selected.');
      return;
    }

    if (stock <= 0) {
      setMessage(`Error: ${cleanPart.name} is out of stock.`);
      return;
    }

    setPartsUsed((current) => {
      const existing = current.find((item) => item.id === cleanPart.id);

      if (existing) {
        if (existing.quantity >= stock) {
          setMessage(`Error: Only ${stock} ${cleanPart.name} in stock.`);
          return current;
        }

        return current.map((item) =>
          item.id === cleanPart.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }

      return [...current, { ...cleanPart, quantity: 1 }];
    });

    setPartSearch('');
  }

  function updatePartQty(id, quantity) {
    setMessage('');

    const cleanId = sanitizeId(id);
    const nextQuantity = parseInt(quantity, 10);

    if (!Number.isFinite(nextQuantity) || nextQuantity < 1) {
      setPartsUsed((current) => current.filter((item) => item.id !== cleanId));
      return;
    }

    setPartsUsed((current) =>
      current.map((item) => {
        if (item.id !== cleanId) return item;

        const maxStock = Number(item.stock_quantity) || 0;
        const safeQty = Math.min(nextQuantity, maxStock || nextQuantity);

        if (maxStock > 0 && nextQuantity > maxStock) {
          setMessage(`Error: Only ${maxStock} ${item.name} in stock.`);
        }

        return { ...item, quantity: safeQty };
      })
    );
  }

  function buildPartsPayload() {
    return partsUsed.map((item) => {
      const livePart = parts.find((part) => part.id === item.id) || item;
      const quantity = Math.max(parseInt(item.quantity || 1, 10) || 1, 1);
      const unitPrice = Math.max(Number(livePart.price ?? item.price) || 0, 0);

      return {
        id: sanitizeId(item.id),
        name: sanitizeText(livePart.name || item.name || 'Product', 100),
        category: sanitizeText(livePart.category || item.category || 'General', 60),
        quantity,
        unit_price: unitPrice,
        subtotal: unitPrice * quantity,
      };
    });
  }

  async function tryInsertBooking(payload) {
    const { data, error } = await supabase
      .from('bookings')
      .insert(payload)
      .select('id, booking_date, booking_time')
      .single();

    if (!error) return data;

    const message = String(error.message || '').toLowerCase();

    if (
      message.includes('schema cache') ||
      message.includes('column') ||
      message.includes('created_by') ||
      message.includes('total_amount') ||
      message.includes('reservation_fee') ||
      message.includes('payment_status') ||
      message.includes('estimated_duration_minutes') ||
      message.includes('product_total') ||
      message.includes('parts_total') ||
      message.includes('products') ||
      message.includes('parts_used')
    ) {
      const fallback = {
        customer_id: payload.customer_id,
        service_id: payload.service_id,
        mechanic_id: payload.mechanic_id,
        booking_date: payload.booking_date,
        booking_time: payload.booking_time,
        status: payload.status,
        notes: payload.notes,
      };

      const retry = await supabase
        .from('bookings')
        .insert(fallback)
        .select('id, booking_date, booking_time')
        .single();

      if (retry.error) throw retry.error;
      return retry.data;
    }

    throw error;
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!customer?.id) {
      setMessage('Error: Select an existing registered customer first.');
      return;
    }

    if (selectedServices.length === 0) {
      setMessage('Error: Select at least one active service.');
      return;
    }

    if (!bookingDate) {
      setMessage('Error: Select a booking date.');
      return;
    }

    if (bookingDate < today) {
      setMessage('Error: Booking date cannot be in the past.');
      return;
    }

    if (!bookingTime) {
      setMessage('Error: Select a booking time.');
      return;
    }

    if (isElapsedTodayTime(bookingDate, bookingTime)) {
      setMessage('Error: This time already elapsed today. Choose a later time or another date.');
      return;
    }

    const selectedSlot = availableSlots.find((item) => item.slot === bookingTime);

    if (selectedSlot?.disabled) {
      setMessage(
        `Error: This time is unavailable${selectedSlot.reason ? ` (${selectedSlot.reason})` : ''}. Choose another time.`
      );
      return;
    }

    const invalidPart = partsUsed.find((item) => {
      const livePart = parts.find((part) => part.id === item.id);
      const stock = Number(livePart?.stock_quantity ?? item.stock_quantity) || 0;
      const quantity = Number(item.quantity) || 0;

      return !livePart || quantity < 1 || quantity > stock;
    });

    if (invalidPart) {
      setMessage(`Error: ${invalidPart.name || 'Selected product'} stock changed. Refresh products and check the quantity.`);
      return;
    }

    const bookingDurationMinutes = getSafeDuration(selectedServices);
    let assignedMechanic = mechanicId
      ? mechanics.find((mechanic) => mechanic.id === mechanicId) || null
      : null;

    try {
      if (mechanicId) {
        const availability = await checkBookingSlotAvailable({
          bookingDate,
          bookingTime,
          durationMinutes: bookingDurationMinutes,
          mechanicId,
        });

        if (!availability.available) {
          setMessage('Error: This mechanic already has an overlapping booking for the selected duration.');
          await fetchSlotAvailability();
          return;
        }
      } else {
        assignedMechanic = await findAvailableMechanicForSlot({
          date: bookingDate,
          time: bookingTime,
          durationMinutes: bookingDurationMinutes,
        });

        if (!assignedMechanic) {
          setMessage('Error: All mechanics already have overlapping bookings for this duration. Choose another time.');
          await fetchSlotAvailability();
          return;
        }
      }
    } catch (availabilityError) {
      setMessage(`Error: ${availabilityError.message || 'Failed to check schedule availability.'}`);
      return;
    }

    const cleanNotes = sanitizeNotes(notes);
    const confirmLines = [
      `Create scheduled booking for ${getCustomerName(customer)}?`,
      '',
      `Services: ${servicesSummary}`,
      `Date: ${bookingDate}`,
      `Time: ${formatTime(bookingTime)}`,
      `Mechanic: ${assignedMechanic ? getMechanicName(assignedMechanic) : 'Auto-assign available mechanic'}`,
      `Service Total: ${formatPeso(serviceTotal)}`,
      `Products Total: ${formatPeso(partsTotal)}`,
      `Reservation Fee: ${formatPeso(reservationFee)}`,
      `Total Bill: ${formatPeso(totalBill)}`,
    ];

    const confirmed = window.confirm(confirmLines.join('\n'));

    if (!confirmed) return;

    setSubmitting(true);
    setMessage('');

    try {
      const partsPayload = buildPartsPayload();

      const partsNotes =
        partsPayload.length > 0
          ? [
              'Products Added:',
              ...partsPayload.map(
                (item) =>
                  `- ${item.quantity} x ${item.name} @ ${formatPeso(item.unit_price)} = ${formatPeso(item.subtotal)}`
              ),
              `Products Total: ${formatPeso(partsTotal)}`,
            ].join('\n')
          : 'Products Added: None';

      const bookingNotes = [
        'STAFF-ASSISTED SCHEDULED BOOKING',
        'This is not a walk-in queue.',
        partsNotes,
        `Service Total: ${formatPeso(serviceTotal)}`,
        `Total Bill: ${formatPeso(totalBill)}`,
        cleanNotes ? `Staff Notes: ${cleanNotes}` : null,
      ]
        .filter(Boolean)
        .join('\n');

      const bookingPayload = {
        customer_id: customer.id,
        service_id: selectedService?.id || null,
        mechanic_id: assignedMechanic?.id || mechanicId || null,
        booking_date: bookingDate,
        booking_time: bookingTime,
        status: 'pending',
        payment_status: 'unpaid',
        reservation_fee: reservationFee,
        service_total: serviceTotal,
        services_summary: servicesSummary,
        estimated_duration_minutes: bookingDurationMinutes,
        parts_total: partsTotal,
        product_total: partsTotal,
        total_amount: totalBill,
        products: partsPayload,
        parts_used: partsPayload,
        notes: bookingNotes,
        created_by: staffId || null,
      };

      const booking = await tryInsertBooking(bookingPayload);

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
          console.warn('Failed to insert booking services:', bookingServicesError.message);
        }
      }

      await supabase.from('audit_logs').insert({
        action: 'CREATE_STAFF_SCHEDULED_BOOKING',
        entity: 'bookings',
        entity_id: booking.id,
        performed_by: staffId || null,
        details: {
          customer_id: customer.id,
          customer_name: getCustomerName(customer),
          service_ids: selectedServices.map((service) => service.id),
          services_summary: servicesSummary,
          mechanic_id: assignedMechanic?.id || mechanicId || null,
          booking_date: bookingDate,
          estimated_duration_minutes: bookingDurationMinutes,
          booking_time: bookingTime,
          service_total: serviceTotal,
          parts_total: partsTotal,
          total_amount: totalBill,
          reservation_fee: reservationFee,
          parts_used: partsPayload,
        },
      });

      setCreatedBooking({
        id: booking.id,
        customerName: getCustomerName(customer),
        serviceName: servicesSummary,
        bookingDate,
        bookingTime,
        mechanicName: assignedMechanic ? getMechanicName(assignedMechanic) : 'Auto-assigned',
        estimatedDuration: bookingDurationMinutes,
        serviceTotal,
        partsTotal,
        total: totalBill,
        partsUsed: partsPayload,
        reservationFee,
      });

      clearCreateBookingDraft();

      setMessage('Scheduled booking created. Products used are included in the total bill.');
      setCustomer(null);
      setServiceIds([]);
      setMechanicId('');
      setBookingDate('');
      setBookingTime('');
      setNotes('');
      setPartSearch('');
      setPartsUsed([]);

      await fetchSchedule();
    } catch (err) {
      setMessage(`Error: ${err.message || 'Failed to create scheduled booking.'}`);
    } finally {
      setSubmitting(false);
    }
  }

  const hasSavedDraft = hasDraftContent();

  return (
    <div>
      <Banner message={message} />

      {hasSavedDraft && (
        <div className="mb-5 flex flex-col gap-3 rounded-3xl border border-primary-200 bg-primary-50 p-4 text-primary-800 dark:border-primary-500/25 dark:bg-primary-500/10 dark:text-primary-200 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-black">Draft auto-saved</p>
            <p className="mt-1 text-xs font-semibold">
              This form will stay even if you change tabs or refresh the page.
            </p>
          </div>

          <button
            type="button"
            onClick={() => resetForm()}
            className="rounded-2xl bg-white px-4 py-2 text-xs font-black text-primary-700 ring-1 ring-primary-200 transition hover:bg-primary-100 dark:bg-dark-800 dark:text-primary-300 dark:ring-primary-500/25"
          >
            Clear Draft
          </button>
        </div>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <StatCard label="Booking Type" value="Scheduled" icon="📅" tone="primary" />
        <StatCard label="Service Total" value={formatPeso(serviceTotal)} icon="💰" tone="accent" />
        <StatCard label="Products Used" value={partsUsed.length} icon="📦" tone="yellow" />
        <StatCard label="Total Bill" value={formatPeso(totalBill)} icon="✅" tone="green" />
      </div>

      {createdBooking && (
        <div className="mb-5 rounded-3xl border border-green-200 bg-green-50 p-5 text-green-800 dark:border-green-500/25 dark:bg-green-500/10 dark:text-green-200">
          <p className="text-xs font-black uppercase tracking-wider">Scheduled Booking Created</p>
          <p className="mt-1 text-2xl font-black">{createdBooking.customerName}</p>
          <p className="mt-1 text-sm font-semibold">
            {createdBooking.serviceName} · {createdBooking.bookingDate} · {formatTime(createdBooking.bookingTime)}
          </p>
          <p className="mt-1 text-xs font-semibold">
            Mechanic: {createdBooking.mechanicName || 'Auto-assigned'} · Duration: {createdBooking.estimatedDuration || 30} mins
          </p>
          <p className="mt-1 text-xs font-semibold">
            Booking #{createdBooking.id?.slice(0, 8).toUpperCase()} · Total {formatPeso(createdBooking.total)}
          </p>

          {createdBooking.partsUsed?.length > 0 && (
            <div className="mt-4 rounded-2xl bg-white/70 p-3 text-xs font-semibold dark:bg-dark-900/50">
              <p className="mb-2 font-black uppercase">Products Used</p>
              <div className="space-y-1">
                {createdBooking.partsUsed.map((item) => (
                  <div key={item.id} className="flex justify-between gap-3">
                    <span>{item.quantity} x {item.name}</span>
                    <span>{formatPeso(item.subtotal)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-5">
          <Section>
            <p className="mb-4 text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
              1. Registered Customer
            </p>
            <CustomerPicker selected={customer} onSelect={setCustomer} />
          </Section>

          <Section>
            <p className="mb-4 text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
              2. Service
            </p>

            <div className="space-y-2">
              {services.map((service) => {
                const selected = serviceIds.includes(service.id);

                return (
                  <button
                    key={service.id}
                    type="button"
                    onClick={() =>
                      setServiceIds((current) => {
                        const cleanId = sanitizeId(service.id);

                        return current.includes(cleanId)
                          ? current.filter((id) => id !== cleanId)
                          : sanitizeServiceIds([...current, cleanId]);
                      })
                    }
                    className={`flex w-full items-center justify-between gap-3 rounded-2xl border p-4 text-left transition ${
                      selected
                        ? 'border-primary-400 bg-primary-50 dark:border-primary-500/40 dark:bg-primary-500/10'
                        : 'border-gray-200 bg-gray-50 hover:border-primary-300 dark:border-dark-700 dark:bg-dark-900'
                    }`}
                  >
                    <div>
                      <p className="text-sm font-black text-gray-950 dark:text-white">
                        {service.name}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
                        {service.estimated_duration_minutes || 0} mins
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-sm font-black text-primary-600 dark:text-primary-400">
                        {formatPeso(getServicePrice(service))}
                      </p>
                      {selected && <p className="text-xs font-black text-green-600">Selected</p>}
                    </div>
                  </button>
                );
              })}
            </div>

            {selectedServices.length > 0 && (
              <div className="mt-3 rounded-2xl bg-gray-50 p-4 text-sm dark:bg-dark-900">
                <div className="flex justify-between gap-3">
                  <span className="font-semibold text-gray-600 dark:text-gray-400">Selected services</span>
                  <span className="font-black text-gray-950 dark:text-white">
                    {selectedServices.length}
                  </span>
                </div>
                <div className="mt-2 flex justify-between gap-3">
                  <span className="font-semibold text-gray-600 dark:text-gray-400">Service total</span>
                  <span className="font-black text-primary-600 dark:text-primary-400">
                    {formatPeso(serviceTotal)}
                  </span>
                </div>
                <div className="mt-2 flex justify-between gap-3">
                  <span className="font-semibold text-gray-600 dark:text-gray-400">Estimated duration</span>
                  <span className="font-black text-gray-950 dark:text-white">
                    {servicesDuration ? `${servicesDuration} mins` : '—'}
                  </span>
                </div>
              </div>
            )}
          </Section>

          <Section>
            <p className="mb-4 text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
              3. Mechanic
            </p>

            <select
              value={mechanicId}
              onChange={(event) => setMechanicId(sanitizeId(event.target.value))}
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
            >
              <option value="">Auto-assign available mechanic</option>
              {mechanics.map((mechanic) => (
                <option key={mechanic.id} value={mechanic.id}>
                  {getMechanicName(mechanic)}
                  {mechanic.specialization ? ` — ${mechanic.specialization}` : ''}
                </option>
              ))}
            </select>
          </Section>

          <Section>
            <p className="mb-4 text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
              4. Products Used
            </p>

            <input
              value={partSearch}
              onChange={(event) => setPartSearch(sanitizeSearchInput(event.target.value))}
              placeholder="Search product used..."
              className="mb-3 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
            />

            <div className="grid max-h-72 gap-2 overflow-y-auto">
              {filteredParts.map((part) => {
                const selectedQty = getPartQty(part.id);

                return (
                  <button
                    key={part.id}
                    type="button"
                    onClick={() => addPart(part)}
                    className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition ${
                      selectedQty > 0
                        ? 'border-primary-500 bg-primary-50 dark:border-primary-500/40 dark:bg-primary-500/10'
                        : 'border-gray-200 bg-gray-50 hover:border-primary-400 dark:border-dark-700 dark:bg-dark-900'
                    }`}
                  >
                    <ProductImage product={part} />

                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-sm font-black text-gray-950 dark:text-white">
                        {part.name}
                      </p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {part.category || 'General'} · {part.stock_quantity} stock
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-sm font-black text-accent-600 dark:text-accent-400">
                        {formatPeso(part.price)}
                      </p>
                      {selectedQty > 0 && (
                        <p className="text-[11px] font-black text-primary-600 dark:text-primary-400">
                          {selectedQty} selected
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <p className="mt-3 rounded-2xl bg-yellow-50 px-4 py-3 text-xs font-semibold leading-5 text-yellow-800 ring-1 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-200 dark:ring-yellow-500/25">
              Products used here are included in the estimated booking bill. Stock will be deducted when the product is actually added during service progress.
            </p>
          </Section>
        </div>

        <div className="space-y-5">
          <Section>
            <p className="mb-4 text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
              5. Date & Time
            </p>

            <input
              type="date"
              min={today}
              value={bookingDate}
              onChange={(event) => {
                setBookingDate(sanitizeDate(event.target.value));
                setBookingTime('');
              }}
              className="mb-4 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
            />

            {(scheduleLoading || availabilityLoading) && (
              <p className="mb-3 text-xs font-semibold text-gray-500 dark:text-gray-400">
                Checking schedule and duration overlaps...
              </p>
            )}

            {selectedServices.length > 0 && (
              <p className="mb-3 rounded-2xl bg-primary-50 px-4 py-3 text-xs font-semibold leading-5 text-primary-800 ring-1 ring-primary-100 dark:bg-primary-500/10 dark:text-primary-200 dark:ring-primary-500/25">
                Selected services need about {servicesDuration || 30} minutes. Time slots that overlap existing bookings are disabled.
              </p>
            )}

            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {availableSlots.map(({ slot, disabled, reason }) => (
                <button
                  key={slot}
                  type="button"
                  disabled={!bookingDate || selectedServices.length === 0 || availabilityLoading || disabled}
                  onClick={() => setBookingTime(slot)}
                  title={reason}
                  className={`rounded-2xl border px-3 py-3 text-xs font-black transition ${
                    bookingTime === slot
                      ? 'border-primary-600 bg-primary-600 text-white shadow-lg shadow-primary-600/20'
                      : disabled
                        ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400 line-through dark:border-dark-700 dark:bg-dark-900 dark:text-gray-600'
                        : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:bg-dark-900 dark:text-gray-300'
                  }`}
                >
                  {formatTime(slot)}
                </button>
              ))}
            </div>

            {Object.values(slotAvailability).some((item) => item?.available === false) && (
              <p className="mt-3 text-xs font-semibold text-yellow-700 dark:text-yellow-300">
                Some slots are disabled because they overlap existing booking duration.
              </p>
            )}
          </Section>

          <Section>
            <p className="mb-4 text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
              6. Selected Products Used
            </p>

            {partsUsed.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center dark:border-dark-700 dark:bg-dark-900/70">
                <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                  No products used yet.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {partsUsed.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-gray-200 bg-gray-50 p-3 dark:border-dark-700 dark:bg-dark-900"
                  >
                    <div className="flex items-center gap-3">
                      <ProductImage product={item} />

                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-1 text-sm font-black text-gray-950 dark:text-white">
                          {item.name}
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {formatPeso(item.price)} each
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => updatePartQty(item.id, 0)}
                        className="rounded-xl bg-red-50 px-2.5 py-1.5 text-xs font-black text-red-700 ring-1 ring-red-200 transition hover:bg-red-100 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updatePartQty(item.id, item.quantity - 1)}
                          className="grid h-9 w-9 place-items-center rounded-xl border border-gray-200 bg-white font-black dark:border-dark-700 dark:bg-dark-800"
                        >
                          −
                        </button>

                        <span className="w-8 text-center text-sm font-black">{item.quantity}</span>

                        <button
                          type="button"
                          onClick={() => updatePartQty(item.id, item.quantity + 1)}
                          disabled={item.quantity >= Number(item.stock_quantity)}
                          className="grid h-9 w-9 place-items-center rounded-xl border border-gray-200 bg-white font-black disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-700 dark:bg-dark-800"
                        >
                          +
                        </button>
                      </div>

                      <p className="text-sm font-black text-accent-600 dark:text-accent-400">
                        {formatPeso((Number(item.price) || 0) * item.quantity)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section>
            <p className="mb-4 text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
              7. Notes
            </p>

            <textarea
              value={notes}
              onChange={(event) => setNotes(sanitizeNotes(event.target.value))}
              rows={4}
              placeholder="Optional notes for this scheduled booking..."
              className="w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
            />
          </Section>

          <Section>
            <p className="mb-4 text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
              Booking Summary
            </p>

            <div className="space-y-2 text-sm font-semibold">
              <div className="flex justify-between gap-3">
                <span>Customer</span>
                <span className="text-right">{customer ? getCustomerName(customer) : '—'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Services</span>
                <span className="text-right">{servicesSummary}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Date</span>
                <span>{bookingDate || '—'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Time</span>
                <span>{bookingTime ? formatTime(bookingTime) : '—'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Estimated Duration</span>
                <span>{servicesDuration ? `${servicesDuration} mins` : '—'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Mechanic</span>
                <span className="text-right">
                  {mechanicId
                    ? getMechanicName(mechanics.find((mechanic) => mechanic.id === mechanicId))
                    : 'Auto-assign available'}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Service Total</span>
                <span>{formatPeso(serviceTotal)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Products Total</span>
                <span>{formatPeso(partsTotal)}</span>
              </div>
              <div className="border-t border-gray-200 pt-3 dark:border-dark-700">
                <div className="flex items-center justify-between">
                  <span className="font-black">Total</span>
                  <span className="text-3xl font-black text-primary-600 dark:text-primary-400">
                    {formatPeso(totalBill)}
                  </span>
                </div>
              </div>
            </div>
          </Section>

          <button
            type="submit"
            disabled={submitting || loading}
            className="w-full rounded-3xl bg-primary-600 py-5 text-base font-black text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? 'Creating Booking...' : '📅 Create Scheduled Booking'}
          </button>
        </div>
      </form>
    </div>
  );
}
