import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

import { supabase } from '../../lib/supabase';
import { fetchPaymentsFor, summarizePayments } from '../../lib/payments';
import { useTheme } from '../../lib/ThemeContext';
import { shareReceiptPdf, saveReceiptPdf } from '../../lib/receiptPdf';

const YELLOW = '#EAB308';

const ORDER_STEPS = [
  { key: 'pending', label: 'Pending', icon: 'time' },
  { key: 'confirmed', label: 'Confirmed', icon: 'checkmark-circle' },
  { key: 'processing', label: 'Processing / Preparing', icon: 'sync-circle' },
  { key: 'ready', label: 'Ready for Pickup', icon: 'bag-check' },
  { key: 'completed', label: 'Completed', icon: 'checkmark-done-circle' },
];

function normalizeStatus(status) {
  const value = String(status || 'pending').toLowerCase();

  if (value === 'preparing') return 'processing';
  if (value === 'ready_for_pickup') return 'ready';
  return value;
}

function humanize(value) {
  if (!value) return '—';
  return String(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getFulfillmentMethod(order) {
  return String(order?.fulfillment_method || 'pickup').toLowerCase();
}

function getReadyLabel(order) {
  return getFulfillmentMethod(order) === 'delivery' ? 'Ready for Delivery' : 'Ready for Pickup';
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
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getOrderTotal(order) {
  const savedTotal = Number(order?.total_amount || 0);

  if (savedTotal > 0) return savedTotal;

  return (order?.order_items || []).reduce((sum, item) => {
    const unitPrice = Number(item.unit_price) || 0;
    const quantity = Number(item.quantity) || 0;
    const subtotal = Number(item.subtotal) || unitPrice * quantity;

    return sum + subtotal;
  }, 0);
}

function getStatusConfig(theme, status) {
  const value = normalizeStatus(status);

  switch (value) {
    case 'completed':
      return {
        label: 'Completed',
        icon: 'checkmark-circle',
        color: theme.success || '#22c55e',
        bg: (theme.success || '#22c55e') + '18',
      };
    case 'ready':
    case 'ready_for_pickup':
      return {
        label: 'Ready for Pickup',
        icon: 'bag-check',
        color: theme.primaryLight || theme.primary || YELLOW,
        bg: (theme.primary || YELLOW) + '18',
      };
    case 'processing':
      return {
        label: 'Processing / Preparing',
        icon: 'sync-circle',
        color: theme.primaryLight || theme.primary || YELLOW,
        bg: (theme.primary || YELLOW) + '18',
      };
    case 'confirmed':
      return {
        label: 'Confirmed',
        icon: 'checkmark-circle',
        color: theme.success || '#22c55e',
        bg: (theme.success || '#22c55e') + '18',
      };
    case 'returned':
      return {
        label: 'Returned',
        icon: 'return-down-back',
        color: theme.warning || '#f97316',
        bg: (theme.warning || '#f97316') + '18',
      };
    case 'cancelled':
      return {
        label: 'Cancelled',
        icon: 'close-circle',
        color: theme.danger || '#ef4444',
        bg: (theme.danger || '#ef4444') + '18',
      };
    default:
      return {
        label: 'Pending',
        icon: 'time',
        color: theme.textMuted || '#9ca3af',
        bg: theme.bg2,
      };
  }
}

function getReceiptNumber(order, payments) {
  const fromOrder = order?.receipt_number;

  if (fromOrder) return fromOrder;

  const latestWithReceipt = [...(payments || [])]
    .reverse()
    .find((payment) => payment?.receipt_number);

  if (latestWithReceipt?.receipt_number) return latestWithReceipt.receipt_number;

  return `MFX-${String(order?.id || '').slice(0, 8).toUpperCase()}`;
}

function getProcessorName(payment) {
  if (!payment?.profiles) return 'System';

  const name = `${payment.profiles.first_name || ''} ${payment.profiles.last_name || ''}`.trim();
  return name || 'System';
}

export default function OrderDetailsScreen({ route, navigation }) {
  const { theme } = useTheme();
  const s = styles(theme);

  const initialOrder = route?.params?.order || null;
  const orderId =
    route?.params?.orderId ||
    route?.params?.id ||
    initialOrder?.id ||
    null;

  const [order, setOrder] = useState(initialOrder);
  const [payments, setPayments] = useState([]);
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(!initialOrder);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [receiptOpen, setReceiptOpen] = useState(false);

  const total = useMemo(() => getOrderTotal(order), [order]);
  const paymentSummary = useMemo(() => summarizePayments(payments || []), [payments]);
  const totalPaidFromPayments = Number(paymentSummary?.totalPaid) || 0;
  const paymentStatus = String(order?.payment_status || '').toLowerCase();
  const paidStatuses = ['paid', 'fully_paid', 'full_paid'];
  const unpaidStatuses = [
    'checkout_created',
    'pending_payment',
    'pending_verification',
    'unpaid',
    'failed',
    'expired',
    'cancelled',
  ];
  const partialStatuses = ['partial', 'partially_paid', 'downpayment_paid'];

  const manualPaidFromOrder =
    Number(order?.amount_paid) ||
    Number(order?.paid_amount) ||
    Number(order?.payment_amount) ||
    0;

  const trustedOrderPaid = partialStatuses.includes(paymentStatus)
    ? Number(order?.down_payment_amount) || 0
    : 0;

  const paidAmountFromRecords = Math.max(
    totalPaidFromPayments,
    manualPaidFromOrder,
    trustedOrderPaid
  );

  const status = getStatusConfig(theme, order?.status);
  const displayStatusLabel = normalizeStatus(order?.status) === 'ready'
    ? getReadyLabel(order)
    : status.label;

  const orderMarkedPaid =
    paidStatuses.includes(paymentStatus) ||
    totalPaidFromPayments >= total ||
    (
      normalizeStatus(order?.status) === 'completed' &&
      !unpaidStatuses.includes(paymentStatus) &&
      paidAmountFromRecords >= total
    );

  const totalPaid = orderMarkedPaid ? total : paidAmountFromRecords;
  const balance = orderMarkedPaid ? 0 : Math.max(total - totalPaid, 0);
  const isFullyPaid = total > 0 && orderMarkedPaid;

  const isPartiallyPaid =
    !isFullyPaid && (totalPaid > 0 || partialStatuses.includes(paymentStatus));

  const paymentLabel = isFullyPaid
    ? 'Fully Paid'
    : isPartiallyPaid
      ? 'Partial / Down Payment Paid'
      : paymentStatus === 'checkout_created'
        ? 'Waiting for PayMongo Payment'
        : paymentStatus === 'pending_verification'
          ? 'Pending Verification'
          : paymentStatus === 'failed'
            ? 'Payment Failed'
            : paymentStatus === 'expired'
              ? 'Payment Expired'
              : 'Pending Payment';

  const receiptAvailable = isFullyPaid || isPartiallyPaid || payments.length > 0;
  const receiptNumber = getReceiptNumber(order, payments);
  const paymentPercent = total > 0 ? Math.min(Math.round((totalPaid / total) * 100), 100) : 0;

  useEffect(() => {
    navigation.setOptions({
      title: 'Order Details',
      headerBackTitle: 'Orders',
    });
  }, [navigation]);

  const fetchPayments = useCallback(async () => {
    if (!orderId) {
      setPayments([]);
      return;
    }

    const manualList = await fetchPaymentsFor({ orderIds: [orderId] });

    const { data: onlinePayments, error: onlineError } = await supabase
      .from('order_payments')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });

    if (onlineError) {
      console.log('Fetch PayMongo order payments error:', onlineError.message);
    }

    const mappedOnlinePayments = (onlinePayments || []).map((payment) => ({
      id: payment.id,
      order_id: payment.order_id,
      amount: Number(payment.amount) || 0,
      payment_type: 'full',
      method: payment.payment_method || 'paymongo_qrph',
      notes: payment.reference_number || payment.provider_payment_id || 'PayMongo QR Ph payment',
      created_at: payment.paid_at || payment.created_at,
      receipt_number: payment.reference_number,
      receipt_status: payment.status,
      receipt_issued_at: payment.paid_at,
      profiles: null,
      provider: payment.provider || 'paymongo',
      reference_number: payment.reference_number,
      provider_payment_id: payment.provider_payment_id,
    }));

    setPayments([...(manualList || []), ...mappedOnlinePayments]);
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

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id) {
        setUserId(null);
        setOrder(null);
        setFetchError('Please log in again to view this order.');
        setLoading(false);
        setRefreshing(false);
        return;
      }

      setUserId(user.id);

      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*, parts(name, image_url, category))')
        .eq('id', orderId)
        .eq('customer_id', user.id)
        .maybeSingle();

      if (error) {
        console.log('Fetch order details error:', error.message);
        setFetchError(error.message);
        setOrder(null);
      } else if (!data) {
        setFetchError('Order not found or you do not have permission to view it.');
        setOrder(null);
      } else {
        setOrder(data);
        // Do not call navigation.setParams here.
        // Some nested navigators do not handle SET_PARAMS after async refresh.
        // The local state is already updated, so this is enough.
      }

      await fetchPayments();

      setLoading(false);
      setRefreshing(false);
    },
    [fetchPayments, navigation, orderId]
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
    if (!orderId || !userId) return;

    const orderChannel = supabase
      .channel(`customer-order-details-${orderId}`)
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

    const paymentChannel = supabase
      .channel(`customer-order-payments-${orderId}`)
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

    const onlinePaymentChannel = supabase
      .channel(`customer-order-paymongo-payments-${orderId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'order_payments',
          filter: `order_id=eq.${orderId}`,
        },
        () => fetchOrderDetails(false)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(orderChannel);
      supabase.removeChannel(paymentChannel);
      supabase.removeChannel(onlinePaymentChannel);
    };
  }, [fetchOrderDetails, fetchPayments, orderId, userId]);

  function onRefresh() {
    setRefreshing(true);
    fetchOrderDetails(false);
  }

  async function shareReceipt() {
    if (!receiptAvailable) {
      Alert.alert('Receipt Pending', 'Receipt details will appear after payment is confirmed.');
      return;
    }

    try {
      await shareReceiptPdf({
        order,
        payments,
      });
    } catch (error) {
      Alert.alert('PDF Failed', error.message || 'Unable to create/share receipt PDF.');
    }
  }

  async function downloadReceipt() {
    if (!receiptAvailable) {
      Alert.alert('Receipt Pending', 'Receipt details will appear after payment is confirmed.');
      return;
    }

    try {
      const result = await saveReceiptPdf({
        order,
        payments,
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

  return (
    <View style={s.container}>
      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
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
              <Text style={s.kicker}>Order Details</Text>
              <Text style={s.title}>Order #{String(order.id || '').slice(0, 8).toUpperCase()}</Text>
              <Text style={s.dateText}>Placed {formatDateTime(order.created_at)}</Text>
            </View>

            <View style={[s.statusBadge, { backgroundColor: status.bg }]}>
              <Ionicons name={status.icon} size={14} color={status.color} />
              <Text style={[s.statusText, { color: status.color }]}>{displayStatusLabel}</Text>
            </View>
          </View>

          <View style={s.totalBox}>
            <Text style={s.totalLabel}>Order Total</Text>
            <Text style={s.totalValue}>{peso(total)}</Text>
          </View>
        </View>

        <Text style={s.sectionTitle}>Fulfillment</Text>
        <View style={s.card}>
          <MoneyRow
            theme={theme}
            label="Method"
            value={humanize(order.fulfillment_method || 'pickup')}
          />
          {String(order.fulfillment_method || '').toLowerCase() === 'delivery' && (
            <MoneyRow
              theme={theme}
              label="Delivery Address"
              value={order.delivery_address || 'No delivery address saved'}
            />
          )}
          <MoneyRow
            theme={theme}
            label="Contact Phone"
            value={order.customer_contact_phone || '—'}
            last
          />
        </View>

        <Text style={s.sectionTitle}>Order Progress</Text>
        <View style={s.card}>
          <View style={s.stepsWrap}>
            {ORDER_STEPS.map((step, index) => {
              const currentIndex = ORDER_STEPS.findIndex(
                (item) => item.key === normalizeStatus(order.status)
              );
              const isDone =
                ['cancelled', 'returned'].includes(normalizeStatus(order.status))
                  ? false
                  : currentIndex >= index;
              const isCurrent = step.key === normalizeStatus(order.status);

              return (
                <View key={step.key} style={s.stepRow}>
                  <View style={s.stepIconCol}>
                    <View
                      style={[
                        s.stepIcon,
                        isDone && { backgroundColor: theme.primary },
                        isCurrent && { borderColor: theme.primaryLight || YELLOW },
                      ]}
                    >
                      <Ionicons
                        name={isDone ? 'checkmark' : step.icon}
                        size={15}
                        color={isDone ? '#fff' : theme.textMuted}
                      />
                    </View>
                    {index !== ORDER_STEPS.length - 1 && (
                      <View
                        style={[
                          s.stepLine,
                          isDone && { backgroundColor: theme.primary + '88' },
                        ]}
                      />
                    )}
                  </View>

                  <View style={s.stepContent}>
                    <Text
                      style={[
                        s.stepLabel,
                        isCurrent && { color: theme.primaryLight || YELLOW },
                      ]}
                    >
                      {step.key === 'ready' ? getReadyLabel(order) : step.label}
                    </Text>
                    <Text style={s.stepSub}>
                      {isCurrent ? 'Current status' : isDone ? 'Completed step' : 'Waiting'}
                    </Text>
                  </View>
                </View>
              );
            })}

            {normalizeStatus(order.status) === 'cancelled' && (
              <View style={s.cancelBox}>
                <Ionicons name="close-circle" size={20} color={theme.danger} />
                <Text style={s.cancelText}>This order was cancelled.</Text>
              </View>
            )}

            {normalizeStatus(order.status) === 'returned' && (
              <View style={[s.cancelBox, { borderColor: (theme.warning || '#f97316') + '55', backgroundColor: (theme.warning || '#f97316') + '14' }]}>
                <Ionicons name="return-down-back" size={20} color={theme.warning || '#f97316'} />
                <Text style={[s.cancelText, { color: theme.warning || '#f97316' }]}>
                  This order was returned to inventory.
                </Text>
              </View>
            )}
          </View>
        </View>

        <Text style={s.sectionTitle}>Payment & Receipt</Text>
        <View style={s.card}>
          <View style={s.paymentHeader}>
            <View style={s.receiptIcon}>
              <Ionicons
                name={receiptAvailable ? 'receipt' : 'wallet-outline'}
                size={22}
                color={receiptAvailable ? theme.primaryLight || YELLOW : theme.textMuted}
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={s.receiptTitle}>{paymentLabel}</Text>
              <Text style={s.receiptSub}>
                {receiptAvailable
                  ? 'Receipt details are available.'
                  : 'Receipt will appear after payment confirmation.'}
              </Text>
            </View>
          </View>

          <MoneyRow theme={theme} label="Order Total" value={peso(total)} />
          <MoneyRow theme={theme} label="Amount Paid" value={peso(totalPaid)} />
          <MoneyRow
            theme={theme}
            label="Remaining Balance"
            value={peso(balance)}
            valueColor={balance <= 0 ? theme.success : theme.danger}
          />
          <MoneyRow
            theme={theme}
            label="Receipt No."
            value={receiptAvailable ? receiptNumber : 'Pending'}
          />
          <MoneyRow
            theme={theme}
            label="Payment Method"
            value={
                order.payment_method === 'paymongo_qrph'
                  ? 'PayMongo QR Ph / GCash'
                  : order.payment_method || payments[payments.length - 1]?.method || 'To be confirmed'
              }
            last
          />

          <View style={s.paymentBarOuter}>
            <View style={[s.paymentBarInner, { width: `${paymentPercent}%` }]} />
          </View>
          <Text style={s.paymentPercent}>{paymentPercent}% paid</Text>

          <View style={s.actionRow}>
            <TouchableOpacity
              style={[s.outlineBtn, !receiptAvailable && s.disabledBtn]}
              onPress={() => setReceiptOpen(true)}
              disabled={!receiptAvailable}
            >
              <Ionicons
                name="receipt-outline"
                size={16}
                color={receiptAvailable ? theme.text : theme.textMuted}
              />
              <Text style={[s.outlineBtnText, !receiptAvailable && { color: theme.textMuted }]}>
                View
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.outlineBtn, !receiptAvailable && s.disabledBtn]}
              onPress={shareReceipt}
              disabled={!receiptAvailable}
            >
              <Ionicons
                name="share-social-outline"
                size={16}
                color={receiptAvailable ? theme.text : theme.textMuted}
              />
              <Text style={[s.outlineBtnText, !receiptAvailable && { color: theme.textMuted }]}>
                Share PDF
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.outlineBtn, !receiptAvailable && s.disabledBtn]}
              onPress={downloadReceipt}
              disabled={!receiptAvailable}
            >
              <Ionicons
                name="download-outline"
                size={16}
                color={receiptAvailable ? theme.text : theme.textMuted}
              />
              <Text style={[s.outlineBtnText, !receiptAvailable && { color: theme.textMuted }]}>
                Save
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={s.sectionTitle}>Order Items</Text>
        <View style={s.card}>
          {order.order_items?.length > 0 ? (
            order.order_items.map((item, index) => {
              const unitPrice = Number(item.unit_price) || 0;
              const quantity = Number(item.quantity) || 0;
              const subtotal = Number(item.subtotal) || unitPrice * quantity;

              return (
                <View
                  key={item.id || `${item.part_id || 'part'}-${index}`}
                  style={[
                    s.itemRow,
                    index !== order.order_items.length - 1 && s.itemBorder,
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
                    <Text style={s.itemMeta}>
                      {item.parts?.category || 'General'} · {peso(unitPrice)} × {quantity}
                    </Text>
                  </View>

                  <Text style={s.itemSubtotal}>{peso(subtotal)}</Text>
                </View>
              );
            })
          ) : (
            <View style={s.emptyBlock}>
              <Ionicons name="cube-outline" size={28} color={theme.textMuted} />
              <Text style={s.mutedText}>No order items found.</Text>
            </View>
          )}
        </View>

        <Text style={s.sectionTitle}>Payment History</Text>
        <View style={s.card}>
          {payments.length > 0 ? (
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
                  <Text style={s.paymentProcessor}>
                    Processed by {getProcessorName(payment)}
                  </Text>
                </View>

                <Text style={s.paymentDate}>{formatDateTime(payment.created_at)}</Text>
              </View>
            ))
          ) : (
            <View style={s.emptyBlock}>
              <Ionicons name="receipt-outline" size={28} color={theme.textMuted} />
              <Text style={s.mutedText}>No payment records yet.</Text>
            </View>
          )}
        </View>

        {!!order.notes && (
          <>
            <Text style={s.sectionTitle}>Order Notes</Text>
            <View style={s.card}>
              <Text style={s.notesText}>{order.notes}</Text>
            </View>
          </>
        )}
      </ScrollView>

      <Modal
        visible={receiptOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setReceiptOpen(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.receiptSheet}>
            <Ionicons name="receipt" size={42} color={theme.primaryLight || YELLOW} />
            <Text style={s.modalTitle}>MotoFix Receipt</Text>
            <Text style={s.modalSub}>Order #{String(order.id || '').slice(0, 8).toUpperCase()}</Text>

            <View style={s.receiptDivider} />

            <ReceiptRow theme={theme} label="Receipt No." value={receiptNumber} />
            <ReceiptRow theme={theme} label="Order Status" value={displayStatusLabel} />
            <ReceiptRow theme={theme} label="Payment Status" value={paymentLabel} />
            <ReceiptRow theme={theme} label="Order Total" value={peso(total)} />
            <ReceiptRow theme={theme} label="Amount Paid" value={peso(totalPaid)} />
            <ReceiptRow theme={theme} label="Balance" value={peso(balance)} />
            <ReceiptRow
              theme={theme}
              label="Payment Method"
              value={
                order.payment_method === 'paymongo_qrph'
                  ? 'PayMongo QR Ph / GCash'
                  : order.payment_method || payments[payments.length - 1]?.method || 'To be confirmed'
              }
            />
            <ReceiptRow theme={theme} label="Date" value={formatDateTime(order.created_at)} />

            <TouchableOpacity style={s.primaryBtn} onPress={shareReceipt}>
              <Ionicons name="share-social-outline" size={17} color="#fff" />
              <Text style={s.primaryBtnText}>Share PDF Receipt</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.modalCancel} onPress={downloadReceipt}>
              <Ionicons name="download-outline" size={17} color={theme.text} />
              <Text style={s.modalCancelText}>Save / Download PDF</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.modalCancel} onPress={() => setReceiptOpen(false)}>
              <Text style={s.modalCancelText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function MoneyRow({ theme, label, value, valueColor, last }) {
  const s = styles(theme);

  return (
    <View style={[s.moneyRow, !last && s.moneyBorder]}>
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
      color: theme.textSub || theme.textMuted,
      marginTop: 10,
      fontWeight: '700',
    },
    content: {
      padding: 16,
      paddingBottom: 42,
    },
    headerCard: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 18,
      padding: 16,
      marginBottom: 18,
    },
    headerTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    kicker: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: 4,
    },
    title: {
      color: theme.text,
      fontSize: 21,
      fontWeight: '900',
      lineHeight: 27,
    },
    dateText: {
      color: theme.textMuted,
      fontSize: 12,
      marginTop: 4,
    },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    statusText: {
      fontSize: 11,
      fontWeight: '900',
    },
    totalBox: {
      backgroundColor: theme.bg2,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 14,
      padding: 14,
      marginTop: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    totalLabel: {
      color: theme.textSub || theme.textMuted,
      fontSize: 13,
      fontWeight: '700',
    },
    totalValue: {
      color: theme.primaryLight || YELLOW,
      fontSize: 20,
      fontWeight: '900',
    },
    sectionTitle: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: 8,
      marginTop: 4,
    },
    card: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 16,
      marginBottom: 18,
      overflow: 'hidden',
    },
    stepsWrap: {
      padding: 14,
    },
    stepRow: {
      flexDirection: 'row',
      minHeight: 58,
    },
    stepIconCol: {
      width: 36,
      alignItems: 'center',
    },
    stepIcon: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: theme.bg2,
      borderWidth: 1,
      borderColor: theme.border,
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 2,
    },
    stepLine: {
      width: 2,
      flex: 1,
      backgroundColor: theme.border,
      marginVertical: 3,
    },
    stepContent: {
      flex: 1,
      paddingLeft: 8,
      paddingBottom: 13,
    },
    stepLabel: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '900',
    },
    stepSub: {
      color: theme.textMuted,
      fontSize: 12,
      marginTop: 3,
    },
    cancelBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: (theme.danger || '#ef4444') + '14',
      borderWidth: 1,
      borderColor: (theme.danger || '#ef4444') + '44',
      borderRadius: 12,
      padding: 12,
      marginTop: 4,
    },
    cancelText: {
      color: theme.danger || '#ef4444',
      fontSize: 13,
      fontWeight: '800',
    },
    paymentHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 14,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    receiptIcon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: theme.bg2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    receiptTitle: {
      color: theme.text,
      fontSize: 15,
      fontWeight: '900',
    },
    receiptSub: {
      color: theme.textMuted,
      fontSize: 12,
      marginTop: 2,
      lineHeight: 17,
    },
    moneyRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
      padding: 14,
    },
    moneyBorder: {
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    moneyLabel: {
      color: theme.textSub || theme.textMuted,
      fontSize: 13,
      flex: 1,
      fontWeight: '700',
    },
    moneyValue: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '900',
      textAlign: 'right',
      flex: 1,
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
    actionRow: {
      flexDirection: 'row',
      gap: 10,
      padding: 14,
      paddingTop: 0,
    },
    outlineBtn: {
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
    outlineBtnText: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '900',
    },
    disabledBtn: {
      opacity: 0.7,
    },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 14,
    },
    itemBorder: {
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    itemImage: {
      width: 58,
      height: 58,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.bg2,
    },
    itemImageFallback: {
      width: 58,
      height: 58,
      borderRadius: 13,
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
    itemMeta: {
      color: theme.textMuted,
      fontSize: 12,
      marginTop: 3,
    },
    itemSubtotal: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '900',
      maxWidth: 90,
      textAlign: 'right',
    },
    paymentItem: {
      flexDirection: 'row',
      gap: 12,
      padding: 14,
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
    emptyBlock: {
      padding: 20,
      alignItems: 'center',
      gap: 8,
    },
    mutedText: {
      color: theme.textMuted,
      fontSize: 13,
      textAlign: 'center',
      lineHeight: 19,
    },
    notesText: {
      color: theme.textSub || theme.textMuted,
      fontSize: 13,
      lineHeight: 20,
      padding: 14,
      fontStyle: 'italic',
    },
    primaryBtn: {
      marginTop: 16,
      borderRadius: 12,
      paddingVertical: 13,
      paddingHorizontal: 14,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
      width: '100%',
    },
    primaryBtnText: {
      color: '#fff',
      fontSize: 14,
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
      backgroundColor: 'rgba(0,0,0,0.62)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    receiptSheet: {
      width: '100%',
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 18,
      padding: 20,
      alignItems: 'center',
    },
    modalTitle: {
      color: theme.text,
      fontSize: 18,
      fontWeight: '900',
      marginTop: 8,
    },
    modalSub: {
      color: theme.textSub || theme.textMuted,
      fontSize: 13,
      marginTop: 2,
    },
    receiptDivider: {
      width: '100%',
      height: 1,
      backgroundColor: theme.border,
      marginVertical: 14,
    },
    receiptRow: {
      width: '100%',
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 14,
      paddingVertical: 7,
    },
    receiptLabel: {
      flex: 1,
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '700',
    },
    receiptValue: {
      flex: 1,
      color: theme.text,
      fontSize: 12,
      fontWeight: '900',
      textAlign: 'right',
    },
    modalCancel: {
      width: '100%',
      marginTop: 10,
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
  });
