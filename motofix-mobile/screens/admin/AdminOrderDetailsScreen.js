import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

import { supabase } from '../../lib/supabase';
import { fetchPaymentsFor, summarizePayments } from '../../lib/payments';
import { notifyRole, notifyUser } from '../../lib/notifications';
import { useTheme } from '../../lib/ThemeContext';
import { shareReceiptPdf, saveReceiptPdf } from '../../lib/receiptPdf';

const YELLOW = '#EAB308';

const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'completed',
  'cancelled',
];

const PAYMENT_TYPES = ['down_payment', 'balance', 'full', 'refund'];
const PAYMENT_METHODS = ['cash', 'gcash', 'card', 'bank_transfer'];

function normalizeStatus(status) {
  return String(status || 'pending').toLowerCase();
}

function humanize(value) {
  if (!value) return '—';
  return String(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function peso(value) {
  const amount = Number(value) || 0;
  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDateTime(value) {
  if (!value) return '—';

  return new Date(value).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getName(profile) {
  const name = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim();
  return name || 'Unknown Customer';
}

function getInitials(profile) {
  return `${profile?.first_name?.[0] || ''}${profile?.last_name?.[0] || ''}`.trim() || '?';
}

function getStatusColor(theme, status) {
  switch (normalizeStatus(status)) {
    case 'pending':
      return theme.warning || '#eab308';
    case 'confirmed':
      return theme.success || '#22c55e';
    case 'preparing':
      return theme.primaryLight || '#a855f7';
    case 'ready':
      return theme.primaryLight || '#3b82f6';
    case 'completed':
      return theme.textMuted || '#9ca3af';
    case 'cancelled':
      return theme.danger || '#ef4444';
    default:
      return theme.textMuted || '#9ca3af';
  }
}

function generateReceiptNumber() {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const random = Math.floor(100000 + Math.random() * 900000);
  return `RCPT-${y}${m}${d}-${random}`;
}

function getOrderTotal(order) {
  const savedTotal = Number(order?.total_amount || 0);

  if (savedTotal > 0) return savedTotal;

  return (order?.order_items || []).reduce((sum, item) => {
    const subtotal = Number(item.subtotal);
    if (Number.isFinite(subtotal) && subtotal > 0) return sum + subtotal;

    return sum + (Number(item.unit_price) || 0) * (Number(item.quantity) || 0);
  }, 0);
}

export default function AdminOrderDetailsScreen({ route, navigation }) {
  const { theme } = useTheme();
  const s = styles(theme);

  const initialOrder = route?.params?.order || null;
  const orderId =
    route?.params?.orderId ||
    route?.params?.id ||
    initialOrder?.id ||
    null;

  const [viewerId, setViewerId] = useState(null);
  const [viewerRole, setViewerRole] = useState(null);
  const [order, setOrder] = useState(initialOrder);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(!initialOrder);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);

  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [paymentType, setPaymentType] = useState('balance');
  const [method, setMethod] = useState('cash');
  const [receipt, setReceipt] = useState(null);

  const customer = order?.profiles || order?.customer || null;
  const total = useMemo(() => getOrderTotal(order), [order]);
  const paymentSummary = useMemo(() => summarizePayments(payments || []), [payments]);
  const totalPaid = Number(paymentSummary?.totalPaid) || 0;
  const balance = Math.max(total - totalPaid, 0);
  const isFullyPaid = total > 0 && balance <= 0;
  const paymentPercent = total > 0 ? Math.min(Math.round((totalPaid / total) * 100), 100) : 0;
  const canAdminUpdate = viewerRole === 'admin' || viewerRole === 'staff';

  useEffect(() => {
    navigation.setOptions({
      title: 'Order Details',
      headerBackTitle: 'Orders',
    });
  }, [navigation]);

  const fetchViewer = useCallback(async () => {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id || null;
    setViewerId(userId);

    if (!userId) return { userId: null, role: null };

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();

    const role = profile?.role || null;
    setViewerRole(role);

    return { userId, role };
  }, []);

  const fetchPayments = useCallback(async () => {
    if (!orderId) {
      setPayments([]);
      return;
    }

    const list = await fetchPaymentsFor({ orderIds: [orderId] });
    setPayments(list || []);
  }, [orderId]);

  const fetchOrderDetails = useCallback(
    async (showMainLoader = false) => {
      if (!orderId) {
        setFetchError('Missing order ID.');
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (showMainLoader) setLoading(true);
      setFetchError('');

      const { userId, role } = await fetchViewer();

      if (!userId) {
        setFetchError('Please log in again to view this order.');
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const { data, error } = await supabase
        .from('orders')
        .select(
          `
          *,
          profiles!orders_customer_id_fkey (
            id,
            first_name,
            last_name,
            email,
            phone
          ),
          order_items (
            *,
            parts (
              id,
              name,
              image_url
            )
          )
        `
        )
        .eq('id', orderId)
        .maybeSingle();

      if (error) {
        setFetchError(error.message || 'Order not found.');
        setOrder(null);
      } else if (!data) {
        setFetchError('Order not found.');
        setOrder(null);
      } else {
        const allowed = role === 'admin' || role === 'staff' || data.customer_id === userId;

        if (!allowed) {
          setFetchError('You do not have permission to view this order.');
          setOrder(null);
        } else {
          setOrder(data);
          navigation.setParams({ order: data, orderId: data.id });
        }
      }

      await fetchPayments();

      setLoading(false);
      setRefreshing(false);
    },
    [fetchPayments, fetchViewer, navigation, orderId]
  );

  useEffect(() => {
    fetchOrderDetails(!initialOrder);
  }, [fetchOrderDetails, initialOrder]);

  useFocusEffect(
    useCallback(() => {
      fetchOrderDetails(false);
    }, [fetchOrderDetails])
  );

  useEffect(() => {
    if (!orderId) return;

    const ordersChannel = supabase
      .channel(`admin-mobile-order-details-${orderId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderId}`,
        },
        () => fetchOrderDetails(false)
      )
      .subscribe();

    const paymentsChannel = supabase
      .channel(`admin-mobile-order-payments-${orderId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payments',
          filter: `order_id=eq.${orderId}`,
        },
        () => fetchPayments()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(paymentsChannel);
    };
  }, [fetchOrderDetails, fetchPayments, orderId]);

  function onRefresh() {
    setRefreshing(true);
    fetchOrderDetails(false);
  }

  async function writeAuditLog(action, details = {}) {
    try {
      await supabase.from('audit_logs').insert({
        action,
        entity: 'orders',
        entity_id: orderId,
        performed_by: viewerId,
        details,
      });
    } catch (error) {
      console.log('Audit log skipped:', error?.message || error);
    }
  }

  async function updateStatus(nextStatus) {
    if (!order?.id || savingStatus) return;

    Alert.alert(
      'Update Order Status',
      `Change this order to "${humanize(nextStatus)}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Update',
          onPress: async () => {
            setSavingStatus(true);

            try {
              const payload = { status: nextStatus };

              if (nextStatus === 'completed') {
                payload.completed_at = new Date().toISOString();
              }

              const { error } = await supabase
                .from('orders')
                .update(payload)
                .eq('id', order.id);

              if (error) throw error;

              await writeAuditLog('UPDATE_ORDER_STATUS', {
                old_status: order.status,
                new_status: nextStatus,
              });

              if (order.customer_id) {
                await notifyUser({
                  userId: order.customer_id,
                  title: 'Order Status Updated',
                  message: `Your parts order is now ${humanize(nextStatus)}.`,
                  type: 'order',
                  relatedTable: 'orders',
                  relatedId: order.id,
                });
              }

              await notifyRole({
                role: 'staff',
                title: 'Order Status Updated',
                message: `Admin updated an order to ${humanize(nextStatus)}.`,
                type: 'order',
                relatedTable: 'orders',
                relatedId: order.id,
              });

              setStatusModalOpen(false);
              await fetchOrderDetails(false);
              Alert.alert('Updated', `Order changed to ${humanize(nextStatus)}.`);
            } catch (error) {
              Alert.alert('Error', error.message || 'Could not update order.');
            } finally {
              setSavingStatus(false);
            }
          },
        },
      ]
    );
  }

  async function tryCreateInvoice({ paidAmount, receiptNumber, isFullPayment }) {
    try {
      await supabase.from('invoices').insert({
        order_id: order.id,
        customer_id: order.customer_id,
        total_amount: total,
        amount_paid: paidAmount,
        status: isFullPayment ? 'paid' : 'partial',
        receipt_number: receiptNumber,
        created_by: viewerId,
      });
    } catch (error) {
      console.log('Invoice insert skipped:', error.message);
    }
  }

  async function markOrderPaidFields({ receiptNumber, paidAmount, selectedMethod, isFullPayment }) {
    if (!isFullPayment) return;

    const fullPayload = {
      payment_received: true,
      payment_method: selectedMethod,
      payment_received_at: new Date().toISOString(),
      payment_received_by: viewerId,
      payment_status: 'paid',
      receipt_number: receiptNumber,
      status: 'completed',
    };

    const { error } = await supabase
      .from('orders')
      .update(fullPayload)
      .eq('id', order.id);

    if (!error) return;

    console.log('Full payment status update skipped, retrying minimal update:', error.message);

    await supabase
      .from('orders')
      .update({
        status: 'completed',
      })
      .eq('id', order.id);
  }

  function openPaymentModal() {
    const due = Math.max(total - totalPaid, 0);
    setAmount(due > 0 ? due.toFixed(2) : '0.00');
    setPaymentType(due > 0 && totalPaid <= 0 ? 'full' : 'balance');
    setMethod('cash');
    setPaymentModalOpen(true);
  }

  async function submitPayment() {
    if (!order?.id || savingPayment) return;

    const paidAmount = parseFloat(amount);

    if (!paidAmount || paidAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid payment amount.');
      return;
    }

    if (paymentType !== 'refund' && paidAmount > balance) {
      Alert.alert('Invalid Amount', `Amount cannot exceed the current balance of ${peso(balance)}.`);
      return;
    }

    setSavingPayment(true);

    const receiptNumber = generateReceiptNumber();
    const selectedMethod = method;
    const nextTotalPaid =
      paymentType === 'refund' ? totalPaid - paidAmount : totalPaid + paidAmount;
    const isFullPayment = total > 0 && nextTotalPaid >= total;

    try {
      const { error: paymentError } = await supabase.from('payments').insert({
        order_id: order.id,
        amount: paidAmount,
        payment_type: paymentType,
        method: selectedMethod,
        receipt_number: receiptNumber,
        processed_by: viewerId,
      });

      if (paymentError) throw paymentError;

      await markOrderPaidFields({
        receiptNumber,
        paidAmount,
        selectedMethod,
        isFullPayment,
      });

      await tryCreateInvoice({
        paidAmount,
        receiptNumber,
        isFullPayment,
      });

      await writeAuditLog('RECORD_ORDER_PAYMENT', {
        amount: paidAmount,
        payment_type: paymentType,
        method: selectedMethod,
        receipt_number: receiptNumber,
        is_full_payment: isFullPayment,
      });

      if (order.customer_id) {
        await notifyUser({
          userId: order.customer_id,
          title: 'Payment Recorded',
          message: `Your order payment of ${peso(paidAmount)} has been recorded.`,
          type: 'payment',
          relatedTable: 'orders',
          relatedId: order.id,
        });
      }

      await notifyRole({
        role: 'staff',
        title: 'Order Payment Recorded',
        message: `Admin recorded an order payment of ${peso(paidAmount)}.`,
        type: 'payment',
        relatedTable: 'orders',
        relatedId: order.id,
      });

      setReceipt({
        customerName: getName(customer),
        amountPaid: paidAmount,
        method: selectedMethod,
        paymentType,
        receiptNumber,
        total,
        isFullPayment,
        referenceId: String(order.id).slice(0, 8).toUpperCase(),
      });

      setPaymentModalOpen(false);
      await fetchOrderDetails(false);
    } catch (error) {
      Alert.alert('Payment Failed', error.message || 'Unable to record payment.');
    } finally {
      setSavingPayment(false);
    }
  }

  function getReceiptPaymentsForPdf() {
    if (payments.length > 0) return payments;

    if (receipt) {
      return [
        {
          amount: receipt.amountPaid,
          method: receipt.method,
          payment_type: receipt.paymentType,
          receipt_number: receipt.receiptNumber,
          created_at: new Date().toISOString(),
        },
      ];
    }

    return [];
  }

  async function sharePdfReceipt() {
    if (!order) return;

    try {
      await shareReceiptPdf({
        order,
        payments: getReceiptPaymentsForPdf(),
        customerName: getName(customer),
      });
    } catch (error) {
      Alert.alert('PDF Failed', error.message || 'Unable to create/share receipt PDF.');
    }
  }

  async function downloadPdfReceipt() {
    if (!order) return;

    try {
      const result = await saveReceiptPdf({
        order,
        payments: getReceiptPaymentsForPdf(),
        customerName: getName(customer),
      });

      if (result?.savedToDownloads) {
        Alert.alert('Saved', 'Receipt PDF was saved to the folder you selected.');
      } else {
        Alert.alert(
          'Receipt Ready',
          'The receipt PDF was created. Use the share/save dialog to save it to Files or Downloads.'
        );
      }
    } catch (error) {
      Alert.alert('Download Failed', error.message || 'Unable to save receipt PDF.');
    }
  }

  function callCustomer() {
    if (customer?.phone) {
      Linking.openURL(`tel:${customer.phone}`);
    }
  }

  function emailCustomer() {
    if (customer?.email) {
      Linking.openURL(`mailto:${customer.email}`);
    }
  }

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={theme.primaryLight || YELLOW} />
        <Text style={s.loadingText}>Loading order details...</Text>
      </View>
    );
  }

  if (fetchError || !order) {
    return (
      <View style={s.centered}>
        <Ionicons name="warning" size={42} color={theme.danger || '#ef4444'} />
        <Text style={s.emptyTitle}>Cannot open order</Text>
        <Text style={s.emptyText}>{fetchError || 'Order not found.'}</Text>
        <TouchableOpacity style={s.primaryBtn} onPress={() => navigation.goBack()}>
          <Text style={s.primaryBtnText}>Back to Orders</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const statusColor = getStatusColor(theme, order.status);

  return (
    <View style={s.container}>
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.primaryLight || YELLOW}
          />
        }
      >
        <View style={s.headerCard}>
          <View style={s.headerTop}>
            <View style={{ flex: 1 }}>
              <Text style={s.kicker}>Admin Order Details</Text>
              <Text style={s.title}>Parts Order</Text>
              <Text style={s.reference}>
                #{String(order.id).slice(0, 8).toUpperCase()} · Created{' '}
                {formatDateTime(order.created_at)}
              </Text>
            </View>

            <View style={[s.statusPill, { backgroundColor: statusColor + '22' }]}>
              <Text style={[s.statusPillText, { color: statusColor }]}>
                {humanize(order.status)}
              </Text>
            </View>
          </View>

          <View style={s.progressOuter}>
            <View
              style={[
                s.progressInner,
                {
                  width: `${paymentPercent}%`,
                },
              ]}
            />
          </View>

          <Text style={s.progressText}>
            Payment progress: {paymentPercent}% paid
          </Text>
        </View>

        <Text style={s.sectionTitle}>Customer</Text>
        <View style={s.card}>
          <ProfileHeader
            theme={theme}
            profile={customer}
            title={getName(customer)}
            subtitle={customer?.email || 'No email'}
          />

          <InfoRow
            theme={theme}
            icon="call"
            label="Phone"
            value={customer?.phone || 'No phone'}
            action={customer?.phone ? callCustomer : null}
          />
          <InfoRow
            theme={theme}
            icon="mail"
            label="Email"
            value={customer?.email || 'No email'}
            action={customer?.email ? emailCustomer : null}
            last
          />
        </View>

        <Text style={s.sectionTitle}>Order Items</Text>
        <View style={s.card}>
          {order.order_items?.length > 0 ? (
            order.order_items.map((item, index) => (
              <View
                key={item.id || `${item.part_id || 'part'}-${index}`}
                style={[
                  s.itemRow,
                  index !== order.order_items.length - 1 && s.itemRowBorder,
                ]}
              >
                {item.parts?.image_url ? (
                  <Image source={{ uri: item.parts.image_url }} style={s.itemImage} />
                ) : (
                  <View style={s.itemImageFallback}>
                    <Ionicons name="cube" size={24} color={theme.textMuted} />
                  </View>
                )}

                <View style={{ flex: 1 }}>
                  <Text style={s.itemName}>{item.parts?.name || 'Part'}</Text>
                  <Text style={s.itemSub}>
                    {item.parts?.category || 'Uncategorized'} · Qty {item.quantity || 0}
                  </Text>
                  {!!item.parts?.description && (
                    <Text style={s.itemDescription} numberOfLines={2}>
                      {item.parts.description}
                    </Text>
                  )}
                </View>

                <View style={s.itemMoney}>
                  <Text style={s.itemPrice}>{peso(item.unit_price)}</Text>
                  <Text style={s.itemSubtotal}>
                    {peso(Number(item.subtotal) || Number(item.unit_price || 0) * Number(item.quantity || 0))}
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <View style={s.emptyBlock}>
              <Ionicons name="cube-outline" size={28} color={theme.textMuted} />
              <Text style={s.mutedText}>No order items found.</Text>
            </View>
          )}

          {!!order.notes && (
            <View style={s.noteBox}>
              <Text style={s.noteLabel}>Order Notes</Text>
              <Text style={s.noteText}>{order.notes}</Text>
            </View>
          )}
        </View>

        <Text style={s.sectionTitle}>Payment Summary</Text>
        <View style={s.card}>
          <MoneyRow theme={theme} label="Order Total" value={peso(total)} />
          <MoneyRow theme={theme} label="Total Paid" value={peso(totalPaid)} />
          <MoneyRow
            theme={theme}
            label="Balance"
            value={peso(balance)}
            valueColor={isFullyPaid ? theme.success : theme.danger}
          />
          <MoneyRow
            theme={theme}
            label="Payment Status"
            value={order.payment_status ? humanize(order.payment_status) : isFullyPaid ? 'Paid' : 'Unpaid / Partial'}
            valueColor={isFullyPaid ? theme.success : theme.warning}
            last
          />

          <View style={s.paymentBarOuter}>
            <View style={[s.paymentBarInner, { width: `${paymentPercent}%` }]} />
          </View>
          <Text style={s.paymentPercent}>{paymentPercent}% paid</Text>

          {canAdminUpdate && !isFullyPaid && (
            <TouchableOpacity
              style={s.primaryBtn}
              onPress={openPaymentModal}
              disabled={savingPayment}
            >
              <Ionicons name="cash" size={18} color="#fff" />
              <Text style={s.primaryBtnText}>Record Payment</Text>
            </TouchableOpacity>
          )}

          {payments.length > 0 && (
            <View style={s.pdfActionRow}>
              <TouchableOpacity style={s.pdfActionBtn} onPress={sharePdfReceipt}>
                <Ionicons name="share-social-outline" size={16} color={theme.text} />
                <Text style={s.pdfActionText}>Share PDF</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.pdfActionBtn} onPress={downloadPdfReceipt}>
                <Ionicons name="download-outline" size={16} color={theme.text} />
                <Text style={s.pdfActionText}>Save PDF</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <Text style={s.sectionTitle}>Payment History</Text>
        <View style={s.card}>
          {payments.length === 0 ? (
            <View style={s.emptyBlock}>
              <Ionicons name="receipt-outline" size={28} color={theme.textMuted} />
              <Text style={s.mutedText}>No payment records yet.</Text>
            </View>
          ) : (
            payments.map((payment, index) => (
              <View
                key={payment.id || `${payment.created_at}-${index}`}
                style={[
                  s.paymentItem,
                  index !== payments.length - 1 && s.paymentItemBorder,
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.paymentAmount}>{peso(payment.amount)}</Text>
                  <Text style={s.paymentMeta}>
                    {humanize(payment.payment_type || 'payment')} ·{' '}
                    {humanize(payment.method || 'cash')}
                  </Text>
                  {!!payment.receipt_number && (
                    <Text style={s.paymentReceipt}>OR {payment.receipt_number}</Text>
                  )}
                  {!!payment.profiles && (
                    <Text style={s.paymentProcessor}>
                      Processed by {getName(payment.profiles)}
                    </Text>
                  )}
                </View>

                <Text style={s.paymentDate}>{formatDateTime(payment.created_at)}</Text>
              </View>
            ))
          )}
        </View>

        <Text style={s.sectionTitle}>Order Status</Text>
        <View style={s.card}>
          <View style={s.statusFlow}>
            {ORDER_STATUSES.map((status) => {
              const active = normalizeStatus(order.status) === status;
              const color = getStatusColor(theme, status);

              return (
                <View
                  key={status}
                  style={[
                    s.statusStep,
                    active && {
                      borderColor: color,
                      backgroundColor: color + '14',
                    },
                  ]}
                >
                  <View style={[s.statusStepDot, { backgroundColor: color }]} />
                  <Text
                    style={[
                      s.statusStepText,
                      active && { color, fontWeight: '900' },
                    ]}
                  >
                    {status === 'ready' ? 'Ready' : humanize(status)}
                  </Text>
                </View>
              );
            })}
          </View>

          {canAdminUpdate && (
            <TouchableOpacity
              style={s.outlineBtn}
              onPress={() => setStatusModalOpen(true)}
              disabled={savingStatus}
            >
              {savingStatus ? (
                <ActivityIndicator color={theme.text} />
              ) : (
                <>
                  <Ionicons name="flash" size={17} color={theme.text} />
                  <Text style={s.outlineBtnText}>Update Status</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={statusModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setStatusModalOpen(false)}
      >
        <TouchableOpacity
          style={s.modalOverlay}
          activeOpacity={1}
          onPress={() => setStatusModalOpen(false)}
        >
          <TouchableOpacity activeOpacity={1} style={s.modalSheet}>
            <Text style={s.modalTitle}>Update Order Status</Text>

            {ORDER_STATUSES.map((status) => {
              const color = getStatusColor(theme, status);
              const active = normalizeStatus(order.status) === status;

              return (
                <TouchableOpacity
                  key={status}
                  style={[
                    s.modalOption,
                    active && { borderColor: color, backgroundColor: color + '16' },
                  ]}
                  onPress={() => updateStatus(status)}
                  disabled={savingStatus}
                >
                  <View style={[s.modalDot, { backgroundColor: color }]} />
                  <Text style={s.modalOptionText}>
                    {status === 'ready' ? 'Ready for Pickup' : humanize(status)}
                  </Text>
                  {active && <Text style={s.currentText}>Current</Text>}
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity style={s.modalCancel} onPress={() => setStatusModalOpen(false)}>
              <Text style={s.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={paymentModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPaymentModalOpen(false)}
      >
        <KeyboardAvoidingView
          style={s.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => setPaymentModalOpen(false)}
          />

          <View style={s.modalSheet}>
            <Text style={s.modalTitle}>Record Payment</Text>
            <Text style={s.modalSub}>{peso(balance)} currently due.</Text>

            <Text style={s.inputLabel}>Amount Received (₱)</Text>
            <TextInput
              style={s.input}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={theme.textMuted}
            />

            <Text style={s.inputLabel}>Payment Type</Text>
            <View style={s.chipRow}>
              {PAYMENT_TYPES.map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[s.smallChip, paymentType === type && s.smallChipActive]}
                  onPress={() => setPaymentType(type)}
                >
                  <Text
                    style={[
                      s.smallChipText,
                      paymentType === type && s.smallChipTextActive,
                    ]}
                  >
                    {humanize(type)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.inputLabel}>Payment Method</Text>
            <View style={s.chipRow}>
              {PAYMENT_METHODS.map((paymentMethod) => (
                <TouchableOpacity
                  key={paymentMethod}
                  style={[s.smallChip, method === paymentMethod && s.smallChipActive]}
                  onPress={() => setMethod(paymentMethod)}
                >
                  <Text
                    style={[
                      s.smallChipText,
                      method === paymentMethod && s.smallChipTextActive,
                    ]}
                  >
                    {humanize(paymentMethod)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={s.primaryBtn}
              onPress={submitPayment}
              disabled={savingPayment}
            >
              {savingPayment ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.primaryBtnText}>Save Payment</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={s.modalCancel} onPress={() => setPaymentModalOpen(false)}>
              <Text style={s.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={!!receipt}
        transparent
        animationType="fade"
        onRequestClose={() => setReceipt(null)}
      >
        <View style={s.receiptOverlay}>
          <View style={s.receiptSheet}>
            <Ionicons name="checkmark-circle" size={44} color={theme.success || '#22c55e'} />
            <Text style={s.receiptTitle}>Payment Recorded</Text>
            <Text style={s.receiptSub}>{receipt?.customerName}</Text>

            <View style={s.receiptDivider} />

            <ReceiptRow theme={theme} label="Receipt No." value={receipt?.receiptNumber} />
            <ReceiptRow theme={theme} label="Reference" value={`#${receipt?.referenceId}`} />
            <ReceiptRow theme={theme} label="Payment Type" value={humanize(receipt?.paymentType)} />
            <ReceiptRow theme={theme} label="Method" value={humanize(receipt?.method)} />
            <ReceiptRow theme={theme} label="Total" value={peso(receipt?.total)} />
            <ReceiptRow theme={theme} label="Paid" value={peso(receipt?.amountPaid)} />

            <Text
              style={[
                s.receiptStatus,
                {
                  color: receipt?.isFullPayment
                    ? theme.success || '#22c55e'
                    : theme.warning || '#eab308',
                },
              ]}
            >
              {receipt?.isFullPayment ? 'Fully paid ✓' : 'Partial payment — balance remains'}
            </Text>

            <TouchableOpacity style={s.primaryBtn} onPress={sharePdfReceipt}>
              <Ionicons name="share-social-outline" size={17} color="#fff" />
              <Text style={s.primaryBtnText}>Share PDF Receipt</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.modalCancel} onPress={downloadPdfReceipt}>
              <Ionicons name="download-outline" size={17} color={theme.text} />
              <Text style={s.modalCancelText}>Save / Download PDF</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.modalCancel} onPress={() => setReceipt(null)}>
              <Text style={s.modalCancelText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ProfileHeader({ theme, profile, title, subtitle }) {
  const s = styles(theme);

  return (
    <View style={s.profileHeader}>
      {profile?.profile_photo_url ? (
        <Image source={{ uri: profile.profile_photo_url }} style={s.profileAvatar} />
      ) : (
        <View style={s.profileAvatarFallback}>
          <Text style={s.profileInitials}>{getInitials(profile)}</Text>
        </View>
      )}

      <View style={{ flex: 1 }}>
        <Text style={s.profileTitle}>{title}</Text>
        <Text style={s.profileSubtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

function InfoRow({ theme, icon, label, value, action, last }) {
  const s = styles(theme);

  return (
    <TouchableOpacity
      activeOpacity={action ? 0.7 : 1}
      onPress={action || undefined}
      style={[s.infoRow, !last && s.infoRowBorder]}
    >
      <Ionicons name={icon} size={18} color={theme.primaryLight || YELLOW} />
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue}>{value}</Text>
      {action && <Ionicons name="open-outline" size={15} color={theme.textMuted} />}
    </TouchableOpacity>
  );
}

function MoneyRow({ theme, label, value, valueColor, last }) {
  const s = styles(theme);

  return (
    <View style={[s.moneyRow, !last && s.moneyRowBorder]}>
      <Text style={s.moneyLabel}>{label}</Text>
      <Text style={[s.moneyValue, valueColor && { color: valueColor }]}>{value}</Text>
    </View>
  );
}

function ReceiptRow({ theme, label, value }) {
  const s = styles(theme);

  return (
    <View style={s.receiptRow}>
      <Text style={s.receiptLabel}>{label}</Text>
      <Text style={s.receiptValue}>{value || '—'}</Text>
    </View>
  );
}

const styles = (theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.bg,
    },
    centered: {
      flex: 1,
      backgroundColor: theme.bg,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 28,
    },
    loadingText: {
      color: theme.textMuted,
      fontSize: 14,
      marginTop: 12,
      fontWeight: '600',
    },
    content: {
      padding: 16,
      paddingBottom: 42,
    },
    headerCard: {
      backgroundColor: theme.card,
      borderRadius: 18,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 18,
    },
    headerTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    kicker: {
      fontSize: 11,
      fontWeight: '900',
      color: theme.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: 4,
    },
    title: {
      fontSize: 21,
      fontWeight: '900',
      color: theme.text,
      lineHeight: 27,
    },
    reference: {
      fontSize: 12,
      color: theme.textMuted,
      marginTop: 4,
      lineHeight: 18,
    },
    statusPill: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    statusPillText: {
      fontSize: 11,
      fontWeight: '900',
      textTransform: 'uppercase',
    },
    progressOuter: {
      height: 8,
      backgroundColor: theme.bg2,
      borderRadius: 999,
      overflow: 'hidden',
      marginTop: 16,
    },
    progressInner: {
      height: '100%',
      backgroundColor: theme.success || '#22c55e',
      borderRadius: 999,
    },
    progressText: {
      marginTop: 8,
      fontSize: 12,
      color: theme.textSub || theme.textMuted,
      fontWeight: '600',
    },
    sectionTitle: {
      fontSize: 12,
      fontWeight: '900',
      color: theme.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: 8,
      marginTop: 4,
    },
    card: {
      backgroundColor: theme.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 18,
      overflow: 'hidden',
    },
    profileHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 14,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      gap: 12,
    },
    profileAvatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.border,
    },
    profileAvatarFallback: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: theme.primary + '22',
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.primary + '44',
    },
    profileInitials: {
      color: theme.primaryLight || YELLOW,
      fontSize: 16,
      fontWeight: '900',
    },
    profileTitle: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '900',
    },
    profileSubtitle: {
      color: theme.textSub || theme.textMuted,
      fontSize: 12,
      marginTop: 2,
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 14,
    },
    infoRowBorder: {
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    infoLabel: {
      flex: 1,
      color: theme.textSub || theme.textMuted,
      fontSize: 13,
      fontWeight: '600',
    },
    infoValue: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '800',
      textAlign: 'right',
      flexShrink: 1,
      maxWidth: '55%',
    },
    itemRow: {
      flexDirection: 'row',
      padding: 14,
      gap: 12,
      alignItems: 'center',
    },
    itemRowBorder: {
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    itemImage: {
      width: 58,
      height: 58,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.bg2,
    },
    itemImageFallback: {
      width: 58,
      height: 58,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.bg2,
      justifyContent: 'center',
      alignItems: 'center',
    },
    itemName: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '900',
    },
    itemSub: {
      color: theme.textSub || theme.textMuted,
      fontSize: 12,
      marginTop: 2,
    },
    itemDescription: {
      color: theme.textMuted,
      fontSize: 11,
      marginTop: 4,
      lineHeight: 16,
    },
    itemMoney: {
      alignItems: 'flex-end',
      maxWidth: 90,
    },
    itemPrice: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
    },
    itemSubtotal: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '900',
      marginTop: 4,
    },
    noteBox: {
      padding: 14,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      backgroundColor: theme.bg2,
    },
    noteLabel: {
      fontSize: 11,
      color: theme.textMuted,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginBottom: 5,
    },
    noteText: {
      color: theme.text,
      fontSize: 13,
      lineHeight: 19,
      fontStyle: 'italic',
    },
    emptyBlock: {
      padding: 20,
      alignItems: 'center',
      gap: 8,
    },
    mutedText: {
      color: theme.textMuted,
      fontSize: 13,
      lineHeight: 19,
      textAlign: 'center',
    },
    moneyRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      padding: 14,
    },
    moneyRowBorder: {
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    moneyLabel: {
      color: theme.textSub || theme.textMuted,
      fontSize: 13,
      fontWeight: '700',
    },
    moneyValue: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '900',
      textAlign: 'right',
      maxWidth: '55%',
    },
    paymentBarOuter: {
      height: 8,
      backgroundColor: theme.bg2,
      marginHorizontal: 14,
      marginTop: 8,
      borderRadius: 999,
      overflow: 'hidden',
    },
    paymentBarInner: {
      height: '100%',
      backgroundColor: theme.success || '#22c55e',
      borderRadius: 999,
    },
    paymentPercent: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '700',
      marginHorizontal: 14,
      marginTop: 6,
      marginBottom: 12,
    },
    paymentItem: {
      flexDirection: 'row',
      padding: 14,
      gap: 10,
    },
    paymentItemBorder: {
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    paymentAmount: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '900',
    },
    paymentMeta: {
      color: theme.textSub || theme.textMuted,
      fontSize: 12,
      marginTop: 2,
    },
    paymentReceipt: {
      color: theme.primaryLight || YELLOW,
      fontSize: 12,
      fontWeight: '800',
      marginTop: 2,
    },
    paymentProcessor: {
      color: theme.textMuted,
      fontSize: 11,
      marginTop: 2,
    },
    paymentDate: {
      color: theme.textMuted,
      fontSize: 11,
      textAlign: 'right',
      maxWidth: 108,
    },
    statusFlow: {
      padding: 14,
      gap: 8,
    },
    statusStep: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      backgroundColor: theme.bg2,
      padding: 11,
    },
    statusStepDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    statusStepText: {
      color: theme.textSub || theme.textMuted,
      fontSize: 13,
      fontWeight: '700',
    },
    primaryBtn: {
      margin: 14,
      borderRadius: 12,
      paddingVertical: 13,
      paddingHorizontal: 14,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    primaryBtnText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '900',
    },
    outlineBtn: {
      margin: 14,
      marginTop: 0,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.bg2,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    outlineBtnText: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '900',
    },
    emptyTitle: {
      color: theme.text,
      fontSize: 18,
      fontWeight: '900',
      marginTop: 12,
    },
    emptyText: {
      color: theme.textSub || theme.textMuted,
      fontSize: 13,
      textAlign: 'center',
      lineHeight: 20,
      marginTop: 6,
      marginBottom: 16,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: theme.card,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      padding: 20,
      maxHeight: '90%',
    },
    modalTitle: {
      color: theme.text,
      fontSize: 17,
      fontWeight: '900',
      textAlign: 'center',
      marginBottom: 5,
    },
    modalSub: {
      color: theme.textSub || theme.textMuted,
      fontSize: 13,
      textAlign: 'center',
      marginBottom: 14,
    },
    modalOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      padding: 13,
      marginBottom: 8,
      backgroundColor: theme.bg2,
    },
    modalDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    modalOptionText: {
      flex: 1,
      color: theme.text,
      fontSize: 14,
      fontWeight: '800',
    },
    currentText: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '800',
    },
    modalCancel: {
      marginTop: 8,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 7,
      backgroundColor: theme.bg2,
    },
    modalCancelText: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '900',
    },
    inputLabel: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '900',
      marginTop: 12,
      marginBottom: 8,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      padding: 12,
      fontSize: 14,
      color: theme.text,
      backgroundColor: theme.bg2,
      marginBottom: 2,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 4,
    },
    smallChip: {
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 18,
      backgroundColor: theme.bg2,
      borderWidth: 1,
      borderColor: theme.border,
    },
    smallChipActive: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    smallChipText: {
      color: theme.textSub || theme.textMuted,
      fontSize: 12,
      fontWeight: '700',
    },
    smallChipTextActive: {
      color: '#fff',
      fontWeight: '900',
    },
    pdfActionRow: {
      flexDirection: 'row',
      gap: 10,
      paddingHorizontal: 14,
      paddingBottom: 14,
    },
    pdfActionBtn: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.bg2,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 7,
    },
    pdfActionText: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '900',
    },
    receiptOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.62)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    receiptSheet: {
      width: '100%',
      backgroundColor: theme.card,
      borderRadius: 18,
      padding: 20,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.border,
    },
    receiptTitle: {
      color: theme.text,
      fontSize: 18,
      fontWeight: '900',
      marginTop: 8,
    },
    receiptSub: {
      color: theme.textSub || theme.textMuted,
      fontSize: 13,
      marginTop: 2,
    },
    receiptDivider: {
      height: 1,
      backgroundColor: theme.border,
      width: '100%',
      marginVertical: 14,
    },
    receiptRow: {
      width: '100%',
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 6,
    },
    receiptLabel: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '700',
    },
    receiptValue: {
      color: theme.text,
      fontSize: 12,
      fontWeight: '900',
      textAlign: 'right',
      maxWidth: '58%',
    },
    receiptStatus: {
      fontSize: 13,
      fontWeight: '900',
      marginTop: 12,
      marginBottom: 4,
      textAlign: 'center',
    },
  });
