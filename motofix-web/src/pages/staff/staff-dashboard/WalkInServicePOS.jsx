// Place this file at:
// motofix-web/src/pages/staff/staff-dashboard/WalkInServicePOS.jsx
//
// Walk-in is now a TRUE QUEUE module.
// It does NOT insert into bookings anymore.
// New records go to walkin_queue.

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { confirmAction } from '../../../components/ConfirmModal';
import CustomerPicker from '../../../components/CustomerPicker';
import { adjustPartStock } from '../../../lib/inventory';
import { createReceiptHistory } from '../../../lib/receiptHistory';

import {
  Banner,
  Section,
  StatCard,
  PaymentMethodPicker,
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

function sanitizeName(value) {
  return String(value || '')
    .replace(/[^a-zA-ZñÑ .'-]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 80);
}

function sanitizePhone(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 11);
}

function sanitizeModel(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9ñÑ .,_/-]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 80);
}


function sanitizeShortText(value, maxLength = 100) {
  return String(value || '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, maxLength);
}

function sanitizeNote(value) {
  return String(value || '')
    .replace(/[<>]/g, '')
    .replace(/[^\S\r\n]+/g, ' ')
    .slice(0, 300);
}

function sanitizeMoneyInput(value) {
  const cleaned = String(value || '').replace(/[^0-9.]/g, '');
  const [whole = '', ...decimalParts] = cleaned.split('.');
  const decimal = decimalParts.join('').slice(0, 2);

  return `${whole.slice(0, 7)}${decimalParts.length ? `.${decimal}` : ''}`;
}

function parseMoney(value) {
  const amount = Number(sanitizeMoneyInput(value));
  return Number.isFinite(amount) ? amount : 0;
}

function sanitizeUuid(value) {
  return String(value || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 80);
}

const GCASH_REFERENCE_MIN_LENGTH = 8;
const GCASH_REFERENCE_MAX_LENGTH = 20;

function sanitizeGcashReference(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\D/g, '')
    .slice(0, GCASH_REFERENCE_MAX_LENGTH);
}

function isValidGcashReference(value) {
  const reference = sanitizeGcashReference(value);

  return (
    reference.length >= GCASH_REFERENCE_MIN_LENGTH &&
    reference.length <= GCASH_REFERENCE_MAX_LENGTH &&
    !/^0+$/.test(reference)
  );
}

function sanitizePaymentMethod(value) {
  const method = String(value || 'cash').toLowerCase();
  return ['cash', 'gcash'].includes(method) ? method : 'cash';
}

function isValidOptionalPhone(value) {
  if (!value) return true;
  return /^09\d{9}$/.test(value);
}

async function findDuplicateWalkinGcashReference(reference) {
  const cleanReference = sanitizeGcashReference(reference);

  if (!isValidGcashReference(cleanReference)) return null;

  const [walkinResult, receiptsResult] = await Promise.all([
    supabase
      .from('walkin_queue_payments')
      .select('id, walkin_queue_id')
      .eq('reference_number', cleanReference)
      .limit(1),
    supabase
      .from('receipts')
      .select('id, source_id')
      .eq('payment_reference', cleanReference)
      .limit(1),
  ]);

  const queryError = walkinResult.error || receiptsResult.error;

  if (queryError) {
    throw new Error(
      queryError.message ||
        'Unable to verify whether the GCash reference was already used.'
    );
  }

  if ((walkinResult.data || []).length > 0) {
    return {
      source: 'walkin_queue_payments',
      id: walkinResult.data[0].id,
    };
  }

  if ((receiptsResult.data || []).length > 0) {
    return {
      source: 'receipts',
      id: receiptsResult.data[0].id,
    };
  }

  return null;
}

function getServicePrice(service) {
  return (Number(service?.base_price) || 0) + (Number(service?.labor_cost) || 0);
}

function getQueueCustomerName(queue) {
  if (queue?.guest_name) return queue.guest_name;
  if (queue?.walkin_customer_name) return queue.walkin_customer_name;

  const profile = queue?.profiles || queue?.customer || queue;
  const name = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim();

  return name || 'Guest Customer';
}

function getMechanicName(queue) {
  const mechanic = queue?.mechanic;
  const name = `${mechanic?.first_name || ''} ${mechanic?.last_name || ''}`.trim();

  return name || 'Unassigned';
}

function formatStatus(value) {
  return String(value || 'queued')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusStyle(status) {
  const value = String(status || 'queued');

  if (value === 'completed') {
    return 'bg-green-50 text-green-700 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25';
  }

  if (value === 'cancelled') {
    return 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25';
  }

  if (value === 'ready_for_payment') {
    return 'bg-yellow-50 text-yellow-700 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25';
  }

  if (['in_progress', 'inspection', 'repairing', 'quality_check'].includes(value)) {
    return 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/25';
  }

  return 'bg-primary-50 text-primary-700 ring-primary-100 dark:bg-primary-500/10 dark:text-primary-300 dark:ring-primary-500/25';
}

function getWalkinReceiptItems(queueItem) {
  const serviceItems = (Array.isArray(queueItem?.services)
    ? queueItem.services
    : []
  ).map((service) => {
    const quantity = Math.max(1, Number(service?.quantity) || 1);
    const unitPrice =
      Number(service?.subtotal) ||
      (Number(service?.base_price) || 0) +
        (Number(service?.labor_cost) || 0);

    return {
      itemType: 'service',
      itemName: service?.name || 'Walk-in Service',
      quantity,
      unitPrice,
      lineTotal:
        Number(service?.subtotal) || unitPrice * quantity,
      relatedServiceId: service?.id || service?.service_id || null,
    };
  });

  const productItems = (Array.isArray(queueItem?.products)
    ? queueItem.products
    : []
  ).map((product) => {
    const quantity = Math.max(1, Number(product?.quantity) || 1);
    const unitPrice =
      Number(product?.unit_price ?? product?.price) || 0;

    return {
      itemType: 'product',
      itemName: product?.name || 'Product / Part',
      quantity,
      unitPrice,
      lineTotal:
        Number(product?.subtotal) || unitPrice * quantity,
      relatedPartId: product?.id || product?.part_id || null,
    };
  });

  const items = [...serviceItems, ...productItems];

  if (items.length > 0) return items;

  return [
    {
      itemType: 'service',
      itemName: 'Walk-in motorcycle service',
      quantity: 1,
      unitPrice: Number(queueItem?.total_amount) || 0,
      lineTotal: Number(queueItem?.total_amount) || 0,
    },
  ];
}

async function saveWalkinReceiptHistory({
  queueItem,
  payment,
  amount,
  cleanMethod,
  cleanReference,
  staffId,
}) {
  const issuedAt =
    payment?.receipt_issued_at ||
    payment?.created_at ||
    new Date().toISOString();

  const receiptNumber =
    payment?.receipt_number ||
    `MTFX-WALKIN-${String(payment?.id || queueItem.id)
      .slice(0, 8)
      .toUpperCase()}`;

  return createReceiptHistory({
    receiptNumber,
    sourceType: 'walkin',
    sourceId: queueItem.id,
    paymentTable: 'walkin_queue_payments',
    paymentId: payment?.id || null,
    customerId: queueItem.customer_id || null,
    customerName: getQueueCustomerName(queueItem),
    customerPhone:
      queueItem.guest_phone ||
      queueItem.walkin_customer_phone ||
      queueItem.profiles?.phone ||
      null,
    customerEmail: queueItem.profiles?.email || null,
    paymentMethod:
      cleanMethod === 'gcash' ? 'GCash Manual' : 'Cash',
    paymentReference:
      cleanReference ||
      payment?.receipt_number ||
      receiptNumber,
    subtotal:
      Number(queueItem.service_total || 0) +
        Number(
          queueItem.product_total ??
            queueItem.parts_total ??
            0
        ) ||
      amount,
    discountAmount: Number(queueItem.discount_amount) || 0,
    taxAmount: 0,
    totalAmount: amount,
    amountPaid: amount,
    balanceAmount: 0,
    status: 'issued',
    notes: `Walk-in service payment for ${queueItem.queue_number}.`,
    issuedBy: staffId || null,
    issuedAt,
    metadata: {
      queue_number: queueItem.queue_number,
      motorcycle_model: queueItem.motorcycle_model || null,
      payment_type: 'full',
      queue_status_before_payment: queueItem.status || null,
    },
    items: getWalkinReceiptItems(queueItem),
  });
}

const WALKIN_SERVICE_DRAFT_KEY = 'motofix_staff_walkin_service_draft';

function readWalkinServiceDraft() {
  try {
    const raw = localStorage.getItem(WALKIN_SERVICE_DRAFT_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveWalkinServiceDraft(draft) {
  try {
    localStorage.setItem(WALKIN_SERVICE_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Ignore browser storage errors.
  }
}

function clearWalkinServiceDraft() {
  try {
    localStorage.removeItem(WALKIN_SERVICE_DRAFT_KEY);
  } catch {
    // Ignore browser storage errors.
  }
}

export default function WalkInServicePOS({ staffId, onReceipt }) {
  const today = getLocalDateString();
  const draft = readWalkinServiceDraft();

  const [customerMode, setCustomerMode] = useState(() => draft.customerMode === 'registered' ? 'registered' : 'guest');
  const [customer, setCustomer] = useState(() => draft.customer || null);
  const [guestName, setGuestName] = useState(() => sanitizeName(draft.guestName || ''));
  const [guestPhone, setGuestPhone] = useState(() => sanitizePhone(draft.guestPhone || ''));

  const [services, setServices] = useState([]);
  const [parts, setParts] = useState([]);
  const [mechanics, setMechanics] = useState([]);
  const [motorcycleModels, setMotorcycleModels] = useState([]);

  const [serviceSearch, setServiceSearch] = useState(() => sanitizeShortText(draft.serviceSearch || '', 80));
  const [partSearch, setPartSearch] = useState(() => sanitizeShortText(draft.partSearch || '', 80));
  const [selectedServices, setSelectedServices] = useState(() => Array.isArray(draft.selectedServices) ? draft.selectedServices : []);
  const [productCart, setProductCart] = useState(() => Array.isArray(draft.productCart) ? draft.productCart : []);

  const [motorcycleModel, setMotorcycleModel] = useState(() => sanitizeModel(draft.motorcycleModel || ''));
  const [mechanicId, setMechanicId] = useState(() => sanitizeUuid(draft.mechanicId || ''));
  const [discount, setDiscount] = useState(() => sanitizeMoneyInput(draft.discount || ''));
  const [notes, setNotes] = useState(() => sanitizeNote(draft.notes || ''));

  const [queue, setQueue] = useState([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [loading, setLoading] = useState(true);

  const [payingQueueId, setPayingQueueId] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState(() => sanitizePaymentMethod(draft.paymentMethod || 'cash'));
  const [paymentReference, setPaymentReference] = useState(() => sanitizeGcashReference(draft.paymentReference || ''));

  const [submitting, setSubmitting] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(null);
  const [message, setMessage] = useState('');
  const [createdQueue, setCreatedQueue] = useState(null);

  useEffect(() => {
    fetchSetup();
    fetchWalkinQueue();

    const tables = ['walkin_queue', 'walkin_queue_payments', 'services', 'parts', 'profiles'];
    const channels = tables.map((table) =>
      supabase
        .channel(`staff-true-walkin-${table}`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
          if (table === 'walkin_queue' || table === 'walkin_queue_payments') {
            fetchWalkinQueue(false);
          } else {
            fetchSetup(false);
          }
        })
        .subscribe()
    );

    return () => channels.forEach((channel) => supabase.removeChannel(channel));
  }, []);

  useEffect(() => {
    const hasDraft =
      customer ||
      customerMode !== 'guest' ||
      guestName.trim() ||
      guestPhone.trim() ||
      serviceSearch.trim() ||
      partSearch.trim() ||
      selectedServices.length > 0 ||
      productCart.length > 0 ||
      motorcycleModel.trim() ||
      mechanicId ||
      discount ||
      notes.trim() ||
      paymentMethod !== 'cash' ||
      paymentReference.trim();

    if (!hasDraft) {
      clearWalkinServiceDraft();
      return;
    }

    saveWalkinServiceDraft({
      customerMode,
      customer,
      guestName,
      guestPhone,
      serviceSearch,
      partSearch,
      selectedServices,
      productCart,
      motorcycleModel,
      mechanicId,
      discount,
      notes,
      paymentMethod,
      paymentReference,
      updatedAt: new Date().toISOString(),
    });
  }, [
    customerMode,
    customer,
    guestName,
    guestPhone,
    serviceSearch,
    partSearch,
    selectedServices,
    productCart,
    motorcycleModel,
    mechanicId,
    discount,
    notes,
    paymentMethod,
    paymentReference,
  ]);

  async function fetchSetup(showLoader = true) {
    if (showLoader) setLoading(true);

    const [servicesResult, partsResult, mechanicsResult, modelsResult] = await Promise.all([
      supabase
        .from('services')
        .select('*')
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
        .select('id, first_name, last_name, specialization, profile_photo_url')
        .eq('role', 'mechanic')
        .order('first_name', { ascending: true }),
      supabase
        .from('motorcycle_models')
        .select('id, make, model')
        .order('make', { ascending: true })
        .order('model', { ascending: true }),
    ]);

    const firstError = [servicesResult, partsResult, mechanicsResult, modelsResult].find(
      (result) => result.error
    )?.error;

    if (firstError) {
      setMessage(`Error: ${firstError.message || 'Failed to load walk-in setup data.'}`);
      setServices([]);
      setParts([]);
      setMechanics([]);
      setMotorcycleModels([]);
      setLoading(false);
      return;
    }

    setServices(servicesResult.data || []);
    setParts(partsResult.data || []);
    setMechanics(mechanicsResult.data || []);
    setMotorcycleModels(modelsResult.data || []);
    setLoading(false);
  }

  async function fetchWalkinQueue(showLoader = true) {
    if (showLoader) setQueueLoading(true);

    const { data, error } = await supabase
      .from('walkin_queue')
      .select(
        `
        *,
        profiles!walkin_queue_customer_id_fkey(first_name, last_name, phone, email, profile_photo_url),
        mechanic:profiles!walkin_queue_mechanic_id_fkey(first_name, last_name)
      `
      )
      .neq('status', 'cancelled')
      .order('queue_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      setMessage(`Error: ${error.message || 'Failed to load walk-in queue. Run the walkin_queue SQL first.'}`);
      setQueue([]);
    } else {
      setQueue(data || []);
    }

    setQueueLoading(false);
  }

  const serviceTotal = selectedServices.reduce((sum, service) => sum + getServicePrice(service), 0);

  const productTotal = productCart.reduce(
    (sum, item) => sum + (Number(item.price) || 0) * item.quantity,
    0
  );

  const subtotalBeforeDiscount = serviceTotal + productTotal;
  const discountAmount = Math.min(Math.max(0, parseMoney(discount)), subtotalBeforeDiscount);
  const total = Math.max(subtotalBeforeDiscount - discountAmount, 0);

  const activeQueue = queue.filter((item) =>
    ['queued', 'in_progress', 'inspection', 'repairing', 'quality_check', 'ready_for_payment'].includes(
      String(item.status || 'queued')
    )
  );

  const completedToday = queue.filter(
    (item) => item.queue_date === today && String(item.status) === 'completed'
  ).length;

  const filteredServices = useMemo(() => {
    const query = sanitizeShortText(serviceSearch, 80).trim().toLowerCase();

    if (!query) return services;

    return services.filter((service) =>
      [service.name, service.description, service.category]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }, [services, serviceSearch]);

  const filteredParts = useMemo(() => {
    const query = sanitizeShortText(partSearch, 80).trim().toLowerCase();

    if (!query) return parts.slice(0, 12);

    return parts
      .filter((part) =>
        [part.name, part.category]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(query)
      )
      .slice(0, 12);
  }, [parts, partSearch]);

  function toggleService(service) {
    setMessage('');

    setSelectedServices((current) => {
      const exists = current.some((item) => item.id === service.id);

      if (exists) {
        return current.filter((item) => item.id !== service.id);
      }

      return [...current, service];
    });
  }

  function getProductQty(productId) {
    return productCart.find((item) => item.id === productId)?.quantity || 0;
  }

  function addProduct(part) {
    setMessage('');

    const stock = Number(part.stock_quantity) || 0;

    if (stock <= 0) {
      setMessage(`Error: ${part.name} is out of stock.`);
      return;
    }

    setProductCart((current) => {
      const existing = current.find((item) => item.id === part.id);

      if (existing) {
        if (existing.quantity >= stock) {
          setMessage(`Error: Only ${stock} ${part.name} in stock.`);
          return current;
        }

        return current.map((item) =>
          item.id === part.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }

      return [...current, { ...part, quantity: 1 }];
    });

    setPartSearch('');
  }

  function updateProductQty(id, quantity) {
    setMessage('');

    const safeInputQty = Math.floor(Number(quantity) || 0);

    if (safeInputQty < 1) {
      setProductCart((current) => current.filter((item) => item.id !== id));
      return;
    }

    setProductCart((current) =>
      current.map((item) => {
        if (item.id !== id) return item;

        const maxStock = Number(item.stock_quantity) || 0;
        const safeQty = Math.min(safeInputQty, maxStock || safeInputQty);

        if (maxStock > 0 && safeInputQty > maxStock) {
          setMessage(`Error: Only ${maxStock} ${item.name} in stock.`);
        }

        return { ...item, quantity: safeQty };
      })
    );
  }

  async function generateQueueNumber() {
    const { data, error } = await supabase.rpc('create_walkin_queue_number', {
      p_queue_date: today,
    });

    if (!error && data) return data;

    const { count } = await supabase
      .from('walkin_queue')
      .select('id', { count: 'exact', head: true })
      .eq('queue_date', today);

    return `WQ-${today.replace(/-/g, '')}-${String((count || 0) + 1).padStart(3, '0')}`;
  }

  async function resetForm(options = {}) {
    if (!options.skipConfirm && hasSavedDraft) {
      const confirmed = await confirmAction({
        title: 'Clear Walk-in Draft?',
        message:
          'This will remove the customer, motorcycle, services, products, discount, payment details, and notes saved in the current walk-in form.',
        confirmLabel: 'Clear Draft',
        cancelLabel: 'Keep Draft',
        tone: 'warning',
      });

      if (!confirmed) return;
    }

    setCustomerMode('guest');
    setCustomer(null);
    setGuestName('');
    setGuestPhone('');
    setServiceSearch('');
    setPartSearch('');
    setSelectedServices([]);
    setProductCart([]);
    setMotorcycleModel('');
    setMechanicId('');
    setDiscount('');
    setNotes('');
    setPaymentMethod('cash');
    setPaymentReference('');
    clearWalkinServiceDraft();
  }

  async function handleCreateQueue(event) {
    event.preventDefault();

    const cleanCustomerMode = customerMode === 'registered' ? 'registered' : 'guest';
    const cleanGuestName = sanitizeName(guestName).trim();
    const cleanGuestPhone = sanitizePhone(guestPhone).trim();
    const cleanMotorcycleModel = sanitizeModel(motorcycleModel).trim();
    const cleanNotes = sanitizeNote(notes).trim();
    const cleanDiscountAmount = parseMoney(discount);
    const cleanSelectedServices = selectedServices.filter((service) => service?.id && service?.name);

    if (cleanCustomerMode === 'registered' && !customer?.id) {
      setMessage('Error: Select an existing registered customer or switch to Guest Customer.');
      return;
    }

    if (cleanCustomerMode === 'guest' && !cleanGuestName) {
      setMessage('Error: Guest name is required.');
      return;
    }

    if (cleanCustomerMode === 'guest' && !isValidOptionalPhone(cleanGuestPhone)) {
      setMessage('Error: Guest phone must be 11 digits and start with 09.');
      return;
    }

    if (!cleanMotorcycleModel) {
      setMessage('Error: Motorcycle model is required.');
      return;
    }

    if (cleanSelectedServices.length === 0) {
      setMessage('Error: Select at least one service.');
      return;
    }

    if (cleanDiscountAmount > subtotalBeforeDiscount) {
      setMessage('Error: Discount cannot be greater than the current bill.');
      return;
    }

    const invalidProduct = productCart.find((item) => {
      const quantity = Math.floor(Number(item.quantity) || 0);
      const stock = Number(item.stock_quantity) || 0;
      return !item.id || quantity < 1 || quantity > stock;
    });

    if (invalidProduct) {
      setMessage(`Error: Check product quantity for ${invalidProduct.name || 'selected product'}.`);
      return;
    }

    const customerName =
      cleanCustomerMode === 'guest'
        ? cleanGuestName
        : getCustomerName(customer);

    const confirmed = await confirmAction({
      title: 'Confirm Walk-in Queue',
      message:
        `Review the walk-in service for ${customerName} before adding it to today’s queue.`,
      details: [
        `Motorcycle: ${cleanMotorcycleModel}`,
        `Services: ${cleanSelectedServices
          .map((service) => service.name)
          .join(', ')}`,
        `Products: ${productCart.length} item(s)`,
        `Total: ${formatPeso(total)}`,
        productCart.length > 0
          ? 'Selected products will be deducted from inventory after confirmation.'
          : 'No inventory products will be deducted.',
      ],
      confirmLabel: 'Add to Queue',
      cancelLabel: 'Review Details',
      tone: 'primary',
    });

    if (!confirmed) return;

    setSubmitting(true);
    setMessage('');

    try {
      const queueNumber = await generateQueueNumber();

      const servicePayload = cleanSelectedServices.map((service) => ({
        id: service.id,
        name: service.name,
        base_price: Number(service.base_price) || 0,
        labor_cost: Number(service.labor_cost) || 0,
        subtotal: getServicePrice(service),
      }));

      const productPayload = productCart.map((item) => {
        const quantity = Math.floor(Number(item.quantity) || 1);
        const unitPrice = Number(item.price) || 0;

        return {
          id: item.id,
          name: sanitizeShortText(item.name, 100),
          quantity,
          unit_price: unitPrice,
          subtotal: unitPrice * quantity,
        };
      });

      const { data: queueRecord, error } = await supabase
        .from('walkin_queue')
        .insert({
          queue_number: queueNumber,
          queue_date: today,
          status: 'queued',
          customer_mode: cleanCustomerMode,
          customer_id: cleanCustomerMode === 'registered' ? customer.id : null,
          guest_name: cleanCustomerMode === 'guest' ? cleanGuestName : null,
          guest_phone: cleanCustomerMode === 'guest' ? cleanGuestPhone || null : null,
          motorcycle_model: cleanMotorcycleModel,
          mechanic_id: mechanicId || null,
          services: servicePayload,
          products: productPayload,
          service_total: serviceTotal,
          product_total: productTotal,
          discount_amount: discountAmount,
          total_amount: total,
          payment_status: 'unpaid',
          notes: cleanNotes || null,
          created_by: staffId || null,
        })
        .select('id, queue_number')
        .single();

      if (error) throw error;

      for (const item of productPayload) {
        await adjustPartStock({
          partId: item.id,
          movementType: 'stock_out',
          quantity: item.quantity,
          reason: `Product used in walk-in queue ${queueNumber}`,
          relatedOrderId: null,
        });
      }

      await supabase.from('audit_logs').insert({
        action: 'CREATE_WALKIN_QUEUE',
        entity: 'walkin_queue',
        entity_id: queueRecord.id,
        performed_by: staffId || null,
        details: {
          queue_number: queueNumber,
          customer_type: cleanCustomerMode,
          customer_name:
            cleanCustomerMode === 'guest' ? cleanGuestName : getCustomerName(customer),
          motorcycle_model: cleanMotorcycleModel,
          services: servicePayload,
          products: productPayload,
          total_amount: total,
        },
      });

      setCreatedQueue({
        queueNumber,
        total,
      });

      setMessage(`Queue ${queueNumber} created. This is queued, not booked.`);
      resetForm({ skipConfirm: true });
      await fetchWalkinQueue(false);
    } catch (err) {
      setMessage(`Error: ${err.message || 'Failed to create walk-in queue.'}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function restoreWalkinProductsToInventory(queueItem) {
    if (!queueItem?.id) return;

    if (queueItem.inventory_restored_at) {
      return;
    }

    const products = Array.isArray(queueItem.products) ? queueItem.products : [];

    if (products.length === 0) {
      return;
    }

    for (const item of products) {
      const partId = item.id || item.part_id;
      const quantity = Number(item.quantity) || 0;

      if (!partId || quantity <= 0) continue;

      await adjustPartStock({
        partId,
        movementType: 'stock_in',
        quantity,
        reason: `Returned to inventory after cancelling walk-in queue ${queueItem.queue_number}`,
        relatedOrderId: null,
      });
    }

    const restoredPayload = {
      inventory_restored_at: new Date().toISOString(),
      inventory_restored_by: staffId || null,
    };

    const { error } = await supabase
      .from('walkin_queue')
      .update(restoredPayload)
      .eq('id', queueItem.id);

    if (error) {
      const message = String(error.message || '').toLowerCase();

      if (
        message.includes('schema cache') ||
        message.includes('column') ||
        message.includes('inventory_restored_at') ||
        message.includes('inventory_restored_by')
      ) {
        console.warn(
          'Inventory was restored, but restore tracking columns are missing. Run the optional SQL file to prevent double-restoring.'
        );
        return;
      }

      throw error;
    }
  }

  async function updateQueueStatus(queueId, status) {
    const queueItem = queue.find((item) => item.id === queueId);
    const nextStatus = String(status || '').toLowerCase();

    if (!queueItem?.id || !nextStatus) return;

    if (String(queueItem.status || '').toLowerCase() === nextStatus) {
      setMessage(`Queue ${queueItem.queue_number} is already ${formatStatus(nextStatus)}.`);
      return;
    }

    const products = Array.isArray(queueItem?.products)
      ? queueItem.products
      : [];
    const isCancellation = nextStatus === 'cancelled';

    const confirmed = await confirmAction({
      title: isCancellation
        ? 'Cancel Walk-in Queue?'
        : 'Update Queue Status?',
      message: isCancellation
        ? `Cancel ${queueItem?.queue_number || 'this walk-in'}?`
        : `Move ${queueItem?.queue_number || 'this walk-in'} to ${formatStatus(
            nextStatus
          )}?`,
      details: isCancellation
        ? [
            `Customer: ${getQueueCustomerName(queueItem)}`,
            products.length > 0
              ? `${products.length} selected product item(s) will be returned to inventory.`
              : 'No inventory products need to be returned.',
          ]
        : [
            `Customer: ${getQueueCustomerName(queueItem)}`,
            `New status: ${formatStatus(nextStatus)}`,
          ],
      confirmLabel: isCancellation
        ? 'Cancel Queue'
        : 'Update Status',
      cancelLabel: 'Go Back',
      tone: isCancellation ? 'danger' : 'primary',
    });

    if (!confirmed) return;

    setUpdatingStatus(`${queueId}-${nextStatus}`);
    setMessage('');

    try {
      if (nextStatus === 'cancelled' && queueItem) {
        await restoreWalkinProductsToInventory(queueItem);
      }

      const { error } = await supabase
        .from('walkin_queue')
        .update({ status: nextStatus })
        .eq('id', queueId);

      if (error) throw error;

      await supabase.from('audit_logs').insert({
        action:
          nextStatus === 'cancelled'
            ? 'CANCEL_WALKIN_QUEUE_RESTORE_INVENTORY'
            : 'UPDATE_WALKIN_QUEUE_STATUS',
        entity: 'walkin_queue',
        entity_id: queueId,
        performed_by: staffId || null,
        details: {
          status: nextStatus,
          inventory_restored:
            nextStatus === 'cancelled'
              ? (Array.isArray(queueItem?.products) ? queueItem.products.length : 0) > 0
              : false,
          products: nextStatus === 'cancelled' ? queueItem?.products || [] : undefined,
        },
      });

      await fetchWalkinQueue(false);
    } catch (err) {
      setMessage(`Error: ${err.message || 'Failed to update queue status.'}`);
    } finally {
      setUpdatingStatus(null);
    }
  }

  async function collectPayment(queueItem) {
    if (!queueItem?.id) return;

    const cleanMethod = sanitizePaymentMethod(paymentMethod);
    const cleanReference = sanitizeGcashReference(paymentReference);
    const amount = Number(queueItem.total_amount) || 0;

    if (amount <= 0) {
      setMessage('Error: Cannot collect payment for a zero-amount walk-in queue.');
      return;
    }

    if (
      cleanMethod === 'gcash' &&
      !isValidGcashReference(cleanReference)
    ) {
      setMessage(
        `Error: Enter a valid GCash reference containing ${GCASH_REFERENCE_MIN_LENGTH}–${GCASH_REFERENCE_MAX_LENGTH} digits only.`
      );
      return;
    }

    if (cleanMethod === 'gcash') {
      try {
        const duplicateReference =
          await findDuplicateWalkinGcashReference(cleanReference);

        if (duplicateReference) {
          setMessage(
            'Error: This GCash reference number has already been used. Check the transaction receipt and enter a unique reference.'
          );
          return;
        }
      } catch (referenceError) {
        setMessage(
          `Error: ${
            referenceError.message ||
            'Unable to validate the GCash reference number.'
          }`
        );
        return;
      }
    }

    const confirmed = await confirmAction({
      title: 'Confirm Walk-in Payment',
      message:
        `Record payment for ${queueItem.queue_number} and complete this walk-in service?`,
      details: [
        `Customer: ${getQueueCustomerName(queueItem)}`,
        `Amount: ${formatPeso(amount)}`,
        `Method: ${cleanMethod === 'gcash' ? 'GCash Manual' : 'Cash'}`,
        cleanReference ? `Reference: ${cleanReference}` : null,
        'The walk-in queue will be marked as completed.',
      ].filter(Boolean),
      confirmLabel: 'Record Payment',
      cancelLabel: 'Review Payment',
      tone: 'primary',
    });

    if (!confirmed) return;

    setUpdatingStatus(`${queueItem.id}-payment`);
    setMessage('');

    try {

      const { data: payment, error: paymentError } = await supabase
        .from('walkin_queue_payments')
        .insert({
          walkin_queue_id: queueItem.id,
          amount,
          payment_type: 'full',
          method: cleanMethod,
          reference_number: cleanReference || null,
          processed_by: staffId || null,
          notes: `Payment for ${queueItem.queue_number}`,
        })
        .select('id, receipt_number, receipt_issued_at, created_at')
        .single();

      if (paymentError) throw paymentError;

      const { error: queueError } = await supabase
        .from('walkin_queue')
        .update({
          status: 'completed',
          payment_status: 'paid',
          payment_method: cleanMethod,
          payment_reference: cleanReference || payment?.receipt_number || null,
          paid_at: new Date().toISOString(),
          payment_received_by: staffId || null,
        })
        .eq('id', queueItem.id);

      if (queueError) throw queueError;

      await supabase.from('audit_logs').insert({
        action: 'COMPLETE_WALKIN_QUEUE_PAYMENT',
        entity: 'walkin_queue',
        entity_id: queueItem.id,
        performed_by: staffId || null,
        details: {
          queue_number: queueItem.queue_number,
          amount,
          method: cleanMethod,
          receipt_number: payment?.receipt_number || null,
          payment_reference: cleanReference || null,
        },
      });

      let receiptHistoryWarning = '';

      try {
        await saveWalkinReceiptHistory({
          queueItem,
          payment,
          amount,
          cleanMethod,
          cleanReference,
          staffId,
        });
      } catch (receiptError) {
        console.error(
          'Walk-in payment saved, but receipt history failed:',
          receiptError
        );

        receiptHistoryWarning =
          ' Payment was saved, but it could not be added to the Receipts tab. Check the receipts table permissions or run the receipt-history SQL migration.';
      }

      onReceipt?.({
        customerName: getQueueCustomerName(queueItem),
        customerPhone:
          queueItem.guest_phone ||
          queueItem.walkin_customer_phone ||
          queueItem.profiles?.phone ||
          '—',
        customerEmail: queueItem.profiles?.email || '—',
        type: 'walkin_queue_service',
        sourceLabel: 'Walk-in Service POS',
        transactionLabel: 'Walk-in Motorcycle Service',
        paymentType: 'full',
        paymentReference:
          cleanReference ||
          payment?.receipt_number ||
          queueItem.queue_number,
        items: [
          ...((queueItem.services || []).map((service) => {
            const quantity = Math.max(
              1,
              Number(service?.quantity) || 1
            );
            const lineTotal =
              Number(service?.subtotal) ||
              (Number(service?.base_price) || 0) +
                (Number(service?.labor_cost) || 0);
            const unitPrice =
              quantity > 0 ? lineTotal / quantity : lineTotal;

            return {
              label: service?.name || 'Motorcycle Service',
              description: 'Service',
              quantity,
              unitPrice,
              lineTotal,
              amount: lineTotal,
            };
          })),
          ...((queueItem.products || []).map((product) => {
            const quantity = Math.max(
              1,
              Number(product?.quantity) || 1
            );
            const unitPrice =
              Number(product?.unit_price ?? product?.price) || 0;
            const lineTotal =
              Number(product?.subtotal) ||
              unitPrice * quantity;

            return {
              label: product?.name || 'Product / Part',
              description: 'Product / Part',
              quantity,
              unitPrice,
              lineTotal,
              amount: lineTotal,
            };
          })),
        ],
        subtotal:
          Number(queueItem.service_total || 0) +
            Number(
              queueItem.product_total ??
                queueItem.parts_total ??
                0
            ) ||
          amount,
        discountAmount:
          Number(queueItem.discount_amount) || 0,
        taxAmount: 0,
        total: amount,
        amountPaid: amount,
        balance: 0,
        status: 'paid',
        paymentMethod:
          cleanMethod === 'gcash'
            ? 'GCash Manual'
            : 'Cash',
        receiptNumber:
          payment?.receipt_number ||
          `MTFX-WALKIN-${String(payment?.id || queueItem.id)
            .slice(0, 8)
            .toUpperCase()}`,
        issuedAt:
          payment?.receipt_issued_at ||
          payment?.created_at ||
          new Date().toISOString(),
        referenceId: queueItem.queue_number,
        queueNumber: queueItem.queue_number,
        motorcycleModel: queueItem.motorcycle_model || '',
        mechanicName: getMechanicName(queueItem),
        notes: queueItem.notes || 'Walk-in service payment.',
      });

      setPaymentMethod('cash');
      setPaymentReference('');
      setPayingQueueId(null);
      setMessage(
        `Payment recorded for ${queueItem.queue_number}.${receiptHistoryWarning}`
      );
      await fetchWalkinQueue(false);
    } catch (err) {
      setMessage(`Error: ${err.message || 'Failed to collect payment.'}`);
    } finally {
      setUpdatingStatus(null);
    }
  }

  const hasSavedDraft =
    customer ||
    customerMode !== 'guest' ||
    guestName.trim() ||
    guestPhone.trim() ||
    serviceSearch.trim() ||
    partSearch.trim() ||
    selectedServices.length > 0 ||
    productCart.length > 0 ||
    motorcycleModel.trim() ||
    mechanicId ||
    discount ||
    notes.trim() ||
    paymentMethod !== 'cash' ||
    paymentReference.trim();

  return (
    <div>
      <Banner message={message} />

      {hasSavedDraft && (
        <div className="mb-5 flex flex-col gap-3 rounded-3xl border border-primary-200 bg-primary-50 p-4 text-primary-800 dark:border-primary-500/25 dark:bg-primary-500/10 dark:text-primary-200 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-black">Walk-in service draft auto-saved</p>
            <p className="mt-1 text-xs font-semibold">
              This queue form will stay even if you change tabs or refresh the page.
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
        <StatCard label="Active Queue" value={activeQueue.length} icon="🎫" tone="primary" />
        <StatCard label="Completed Today" value={completedToday} icon="✅" tone="green" />
        <StatCard label="Selected Services" value={selectedServices.length} icon="🔧" tone="accent" />
        <StatCard label="Current Bill" value={formatPeso(total)} icon="💰" tone="yellow" />
      </div>

      {createdQueue && (
        <div className="mb-5 rounded-3xl border border-primary-200 bg-primary-50 p-5 text-primary-800 dark:border-primary-500/25 dark:bg-primary-500/10 dark:text-primary-200">
          <p className="text-xs font-black uppercase tracking-wider">Walk-in Queue Created</p>
          <p className="mt-1 text-3xl font-black">{createdQueue.queueNumber}</p>
          <p className="mt-1 text-sm font-semibold">
            This customer is queued, not booked · Total bill {formatPeso(createdQueue.total)}
          </p>
        </div>
      )}

      <Section className="mb-6">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
              Active Walk-in Queue
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Walk-ins are stored in walkin_queue. They do not appear in Booking Queue.
            </p>
          </div>

          <button
            type="button"
            onClick={() => fetchWalkinQueue(false)}
            className="rounded-2xl border border-gray-200 px-4 py-3 text-xs font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300"
          >
            Refresh Queue
          </button>
        </div>

        {queueLoading ? (
          <div className="h-28 animate-pulse rounded-3xl bg-gray-100 dark:bg-dark-900" />
        ) : activeQueue.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center dark:border-dark-700 dark:bg-dark-900/70">
            <p className="text-sm font-black text-gray-950 dark:text-white">
              No active walk-ins yet
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Create a walk-in queue number below.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {activeQueue.map((item) => {
              const isPaying = payingQueueId === item.id;
              const isUpdating = String(updatingStatus || '').startsWith(item.id);
              const serviceNames = Array.isArray(item.services)
                ? item.services.map((service) => service.name).filter(Boolean).join(', ')
                : 'Service';

              return (
                <article
                  key={item.id}
                  className="rounded-3xl border border-gray-200 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-2xl font-black text-primary-600 dark:text-primary-400">
                        {item.queue_number}
                      </p>
                      <p className="mt-1 text-sm font-black text-gray-950 dark:text-white">
                        {getQueueCustomerName(item)}
                      </p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {item.motorcycle_model} · {serviceNames || 'Service'}
                      </p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Mechanic: {getMechanicName(item)}
                      </p>
                    </div>

                    <div className="flex flex-col items-start gap-2 sm:items-end">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wide ring-1 ${statusStyle(item.status)}`}
                      >
                        {formatStatus(item.status)}
                      </span>
                      <p className="text-lg font-black text-accent-600 dark:text-accent-400">
                        {formatPeso(item.total_amount)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.status === 'queued' && (
                      <button
                        type="button"
                        disabled={isUpdating}
                        onClick={() => updateQueueStatus(item.id, 'in_progress')}
                        className="rounded-2xl bg-blue-600 px-4 py-2 text-xs font-black text-white transition hover:bg-blue-700 disabled:opacity-50"
                      >
                        Start Service
                      </button>
                    )}

                    {['in_progress', 'inspection', 'repairing', 'quality_check'].includes(item.status) && (
                      <>
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => updateQueueStatus(item.id, 'inspection')}
                          className="rounded-2xl border border-gray-200 px-4 py-2 text-xs font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 disabled:opacity-50 dark:border-dark-700 dark:text-gray-300"
                        >
                          Inspection
                        </button>

                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => updateQueueStatus(item.id, 'repairing')}
                          className="rounded-2xl border border-gray-200 px-4 py-2 text-xs font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 disabled:opacity-50 dark:border-dark-700 dark:text-gray-300"
                        >
                          Repairing
                        </button>

                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => updateQueueStatus(item.id, 'quality_check')}
                          className="rounded-2xl border border-gray-200 px-4 py-2 text-xs font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 disabled:opacity-50 dark:border-dark-700 dark:text-gray-300"
                        >
                          Quality Check
                        </button>

                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => updateQueueStatus(item.id, 'ready_for_payment')}
                          className="rounded-2xl bg-yellow-500 px-4 py-2 text-xs font-black text-white transition hover:bg-yellow-600 disabled:opacity-50"
                        >
                          Ready for Payment
                        </button>
                      </>
                    )}

                    {item.status === 'ready_for_payment' && (
                      <button
                        type="button"
                        disabled={isUpdating}
                        onClick={() => setPayingQueueId(isPaying ? null : item.id)}
                        className="rounded-2xl bg-green-600 px-4 py-2 text-xs font-black text-white transition hover:bg-green-700 disabled:opacity-50"
                      >
                        Collect Payment
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={() => updateQueueStatus(item.id, 'cancelled')}
                      className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-black text-red-700 transition hover:bg-red-100 disabled:opacity-50 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300"
                    >
                      Cancel
                    </button>
                  </div>

                  {isPaying && (
                    <div className="mt-4 rounded-3xl border border-green-200 bg-green-50 p-4 dark:border-green-500/25 dark:bg-green-500/10">
                      <p className="mb-3 text-xs font-black uppercase tracking-wider text-green-800 dark:text-green-200">
                        Collect Payment
                      </p>

                      <PaymentMethodPicker value={paymentMethod} onChange={(nextMethod) => setPaymentMethod(sanitizePaymentMethod(nextMethod))} />

                      {paymentMethod === 'gcash' && (
                        <div className="mt-3">
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={GCASH_REFERENCE_MAX_LENGTH}
                            autoComplete="off"
                            autoCapitalize="none"
                            spellCheck={false}
                            value={paymentReference}
                            onChange={(event) => {
                              setPaymentReference(
                                sanitizeGcashReference(
                                  event.target.value
                                )
                              );
                              setMessage('');
                            }}
                            placeholder={`${GCASH_REFERENCE_MIN_LENGTH}–${GCASH_REFERENCE_MAX_LENGTH} digits`}
                            aria-describedby={`walkin-gcash-help-${item.id}`}
                            className={`w-full rounded-2xl border bg-white px-4 py-3 text-sm font-semibold tracking-wider text-gray-900 outline-none transition focus:ring-4 dark:bg-dark-800 dark:text-white ${
                              paymentReference &&
                              !isValidGcashReference(paymentReference)
                                ? 'border-red-400 focus:border-red-500 focus:ring-red-500/10 dark:border-red-500'
                                : 'border-gray-200 focus:border-primary-500 focus:ring-primary-500/10 dark:border-dark-700'
                            }`}
                          />

                          <div
                            id={`walkin-gcash-help-${item.id}`}
                            className="mt-2 flex items-center justify-between gap-3 text-[10px]"
                          >
                            <span
                              className={
                                paymentReference &&
                                !isValidGcashReference(
                                  paymentReference
                                )
                                  ? 'font-bold text-red-600 dark:text-red-400'
                                  : 'text-gray-500 dark:text-gray-400'
                              }
                            >
                              Digits only. Spaces, letters, and symbols are
                              removed automatically.
                            </span>

                            <span className="whitespace-nowrap font-black text-gray-500 dark:text-gray-400">
                              {paymentReference.length}/
                              {GCASH_REFERENCE_MAX_LENGTH}
                            </span>
                          </div>
                        </div>
                      )}

                      <button
                        type="button"
                        disabled={isUpdating}
                        onClick={() => collectPayment(item)}
                        className="mt-3 w-full rounded-2xl bg-green-600 px-4 py-3 text-sm font-black text-white transition hover:bg-green-700 disabled:opacity-50"
                      >
                        Confirm Payment & Complete
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </Section>

      <form onSubmit={handleCreateQueue} className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-5">
          <Section>
            <p className="mb-4 text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
              1. Customer Type
            </p>

            <div className="mb-4 grid grid-cols-2 gap-2 rounded-3xl bg-gray-100 p-2 dark:bg-dark-900">
              {[
                { id: 'guest', label: 'Guest Customer' },
                { id: 'registered', label: 'Registered Customer' },
              ].map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => {
                    setCustomerMode(mode.id);
                    setMessage('');
                  }}
                  className={`rounded-2xl px-4 py-3 text-xs font-black transition ${
                    customerMode === mode.id
                      ? 'bg-white text-primary-700 shadow-sm dark:bg-dark-800 dark:text-primary-400'
                      : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            {customerMode === 'guest' ? (
              <div className="grid gap-3">
                <input
                  value={guestName}
                  onChange={(event) => setGuestName(sanitizeName(event.target.value))}
                  placeholder="Guest customer name"
                  maxLength={80}
                  className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
                />

                <input
                  value={guestPhone}
                  onChange={(event) => setGuestPhone(sanitizePhone(event.target.value))}
                  placeholder="Phone optional, 09XXXXXXXXX"
                  inputMode="numeric"
                  maxLength={11}
                  pattern="09[0-9]{9}"
                  className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
                />
              </div>
            ) : (
              <CustomerPicker selected={customer} onSelect={setCustomer} />
            )}
          </Section>

          <Section>
            <p className="mb-4 text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
              2. Motorcycle & Mechanic
            </p>

            <div className="grid gap-3">
              <input
                list="walkin-motorcycle-models"
                value={motorcycleModel}
                onChange={(event) => setMotorcycleModel(sanitizeModel(event.target.value))}
                placeholder="Motorcycle model"
                className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
              />

              <datalist id="walkin-motorcycle-models">
                {motorcycleModels.map((model) => (
                  <option key={model.id} value={`${model.make} ${model.model}`} />
                ))}
              </datalist>

              <select
                value={mechanicId}
                onChange={(event) => setMechanicId(sanitizeUuid(event.target.value))}
                className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
              >
                <option value="">Assign mechanic later</option>
                {mechanics.map((mechanic) => (
                  <option key={mechanic.id} value={mechanic.id}>
                    {mechanic.first_name} {mechanic.last_name}
                  </option>
                ))}
              </select>
            </div>

            <p className="mt-3 rounded-2xl bg-yellow-50 px-4 py-3 text-xs font-semibold text-yellow-800 ring-1 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-200 dark:ring-yellow-500/25">
              No date/time selection here. Walk-in means the customer is physically in the shop and goes to today’s queue.
            </p>
          </Section>

          <Section>
            <p className="mb-1 text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
              3. Services
            </p>
            <p className="mb-4 text-xs font-semibold text-gray-500 dark:text-gray-400">
              Select one or more services. Selected items will be marked below.
            </p>

            <input
              value={serviceSearch}
              onChange={(event) => setServiceSearch(sanitizeShortText(event.target.value, 80))}
              placeholder="Search service..."
              className="mb-3 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
            />

            <div className="grid max-h-72 gap-2 overflow-y-auto">
              {filteredServices.map((service) => {
                const active = selectedServices.some((item) => item.id === service.id);

                return (
                  <button
                    key={service.id}
                    type="button"
                    onClick={() => toggleService(service)}
                    className={`rounded-2xl border p-3 text-left transition ${
                      active
                        ? 'border-primary-500 bg-primary-50 dark:border-primary-500/40 dark:bg-primary-500/10'
                        : 'border-gray-200 bg-gray-50 hover:border-primary-400 dark:border-dark-700 dark:bg-dark-900'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-gray-950 dark:text-white">
                          {service.name}
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {service.estimated_duration_minutes
                            ? `${service.estimated_duration_minutes} mins`
                            : 'Service'}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-sm font-black text-accent-600 dark:text-accent-400">
                          {formatPeso(getServicePrice(service))}
                        </p>
                        {active && (
                          <p className="mt-1 text-xs font-black text-green-600 dark:text-green-400">
                            Selected
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {selectedServices.length > 0 && (
              <div className="mt-3 rounded-2xl bg-gray-50 p-4 text-sm dark:bg-dark-900">
                <div className="flex justify-between gap-3">
                  <span className="font-semibold text-gray-600 dark:text-gray-400">
                    Selected services
                  </span>
                  <span className="font-black text-gray-950 dark:text-white">
                    {selectedServices.length}
                  </span>
                </div>

                <div className="mt-2 flex justify-between gap-3">
                  <span className="font-semibold text-gray-600 dark:text-gray-400">
                    Service total
                  </span>
                  <span className="font-black text-primary-600 dark:text-primary-400">
                    {formatPeso(serviceTotal)}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedServices.map((service) => (
                    <button
                      key={service.id}
                      type="button"
                      onClick={() => toggleService(service)}
                      className="rounded-full bg-primary-100 px-3 py-1 text-xs font-black text-primary-700 transition hover:bg-primary-200 dark:bg-primary-500/10 dark:text-primary-300"
                    >
                      {service.name} ✕
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Section>
        </div>

        <div className="space-y-5">
          <Section>
            <p className="mb-4 text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
              4. Products Used
            </p>

            <input
              value={partSearch}
              onChange={(event) => setPartSearch(sanitizeShortText(event.target.value, 80))}
              placeholder="Search product used during service..."
              className="mb-3 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
            />

            {partSearch.trim() && (
              <div className="mb-4 grid gap-2">
                {filteredParts.map((part) => {
                  const inCart = getProductQty(part.id);

                  return (
                    <button
                      key={part.id}
                      type="button"
                      onClick={() => addProduct(part)}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-3 text-left transition hover:border-primary-400 dark:border-dark-700 dark:bg-dark-900"
                    >
                      <div>
                        <p className="text-sm font-black text-gray-950 dark:text-white">
                          {part.name}
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {part.stock_quantity} stock · {part.category || 'General'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-black text-accent-600 dark:text-accent-400">
                          {formatPeso(part.price)}
                        </p>
                        {inCart > 0 && (
                          <p className="text-[11px] font-black text-primary-600 dark:text-primary-400">
                            {inCart} selected
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {productCart.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center dark:border-dark-700 dark:bg-dark-900/70">
                <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                  No products added yet.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {productCart.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-3 dark:border-dark-700 dark:bg-dark-900"
                  >
                    <div>
                      <p className="text-sm font-black text-gray-950 dark:text-white">
                        {item.name}
                      </p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {formatPeso(item.price)} each
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateProductQty(item.id, item.quantity - 1)}
                        className="grid h-8 w-8 place-items-center rounded-xl border border-gray-200 bg-white font-black dark:border-dark-700 dark:bg-dark-800"
                      >
                        −
                      </button>

                      <span className="w-7 text-center text-sm font-black">{item.quantity}</span>

                      <button
                        type="button"
                        onClick={() => updateProductQty(item.id, item.quantity + 1)}
                        disabled={item.quantity >= Number(item.stock_quantity)}
                        className="grid h-8 w-8 place-items-center rounded-xl border border-gray-200 bg-white font-black disabled:opacity-40 dark:border-dark-700 dark:bg-dark-800"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section>
            <p className="mb-4 text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
              5. Bill Summary
            </p>

            <div className="space-y-2 text-sm font-semibold">
              <div className="flex justify-between">
                <span>Services</span>
                <span>{formatPeso(serviceTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Products</span>
                <span>{formatPeso(productTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Discount</span>
                <span>- {formatPeso(discountAmount)}</span>
              </div>
              <div className="border-t border-gray-200 pt-3 dark:border-dark-700">
                <div className="flex items-center justify-between">
                  <span className="font-black">Total</span>
                  <span className="text-3xl font-black text-primary-600 dark:text-primary-400">
                    {formatPeso(total)}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              <input
                type="number"
                min="0"
                value={discount}
                onChange={(event) => setDiscount(sanitizeMoneyInput(event.target.value))}
                placeholder="Discount amount"
                className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
              />

              <textarea
                value={notes}
                onChange={(event) => setNotes(sanitizeNote(event.target.value))}
                rows={3}
                placeholder="Optional queue note..."
                className="resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
              />
            </div>
          </Section>

          <button
            type="submit"
            disabled={submitting || loading}
            className="w-full rounded-3xl bg-primary-600 py-5 text-base font-black text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? 'Creating Queue...' : '🎫 Create Walk-in Queue Number'}
          </button>
        </div>
      </form>
    </div>
  );
}