import React from 'react';
import {
  Linking,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../lib/ThemeContext';

const YELLOW = '#EAB308';

function formatPeso(value) {
  const amount = Number(value) || 0;

  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function shortId(value) {
  if (!value) return '—';

  return String(value).slice(0, 8).toUpperCase();
}

function humanize(value) {
  if (!value) return '—';

  return String(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getItemCount(items = []) {
  return items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
}

function getPaymentMethodLabel(method) {
  const value = String(method || '').toLowerCase();

  if (value === 'paymongo_qrph') return 'PayMongo QR Ph / GCash';
  if (value === 'gcash_manual') return 'GCash Manual Verification';
  if (value === 'cash_on_pickup') return 'Pay at Counter';
  if (value === 'qrph') return 'QR Ph / GCash';

  return method ? humanize(method) : 'To be confirmed';
}

function getStatusColor(theme, paymentStatus) {
  const value = String(paymentStatus || '').toLowerCase();

  if (value === 'paid') return theme.success || '#22c55e';
  if (value === 'checkout_created' || value === 'pending_payment') return theme.warning || YELLOW;
  if (value === 'pending_verification') return theme.primaryLight || YELLOW;
  if (value === 'failed' || value === 'cancelled') return theme.danger || '#ef4444';

  return theme.textMuted || '#9ca3af';
}

export default function OrderConfirmationScreen({ route, navigation }) {
  const { theme, isDark } = useTheme();
  const s = styles(theme);
  const params = route?.params || {};

  const order = params.order || {};
  const orderId = params.orderId || order.id;
  const totalAmount = Number(params.totalAmount || order.total_amount || 0);
  const itemCount = params.itemCount || getItemCount(params.items || order.order_items || []);
  const orderItems = params.items || order.order_items || [];

  const orderStatus = params.status || order.status || 'pending';
  const paymentStatus = String(
    params.paymentStatus ||
      order.payment_status ||
      (params.checkoutUrl ? 'checkout_created' : 'pending_payment')
  ).toLowerCase();

  const paymentMethod = params.paymentMethod || order.payment_method || 'cash_on_pickup';
  const checkoutUrl = params.checkoutUrl || order.checkout_url || null;
  const paidAt = params.paidAt || order.paid_at || null;

  const isPaid = paymentStatus === 'paid';
  const isCheckoutCreated = paymentStatus === 'checkout_created';
  const isPendingVerification = paymentStatus === 'pending_verification';

  const paidAmount = isPaid
    ? totalAmount
    : Number(params.downPayment || order.down_payment_amount || 0);

  const remainingBalance = isPaid
    ? 0
    : Number(
        params.remainingBalance ??
          order.remaining_balance ??
          Math.max(totalAmount - paidAmount, 0)
      );

  const receiptStatus =
    params.receiptStatus ||
    (isPaid
      ? 'Payment received'
      : isCheckoutCreated
        ? 'Waiting for PayMongo payment'
        : isPendingVerification
          ? 'Pending GCash verification'
          : 'Pending counter payment');

  const statusColor = getStatusColor(theme, paymentStatus);

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.bg}
      />

      <View style={s.heroCard}>
        <View
          style={[
            s.successIcon,
            { backgroundColor: isPaid ? theme.success || '#22c55e' : YELLOW },
          ]}
        >
          <Ionicons
            name={isPaid ? 'checkmark-circle' : 'bag-check'}
            size={40}
            color="#111827"
          />
        </View>

        <Text style={s.title}>
          {isPaid ? 'Payment Received!' : 'Order Submitted!'}
        </Text>

        <Text style={s.subtitle}>
          {isPaid
            ? 'Your product order payment was received. MotoFix will now process your order.'
            : isCheckoutCreated
              ? 'Your order was submitted. Complete your PayMongo QR Ph / GCash payment to continue processing.'
              : 'Your parts order was sent to MotoFix. Staff will verify payment and stock before release.'}
        </Text>

        <View
          style={[
            s.statusPill,
            {
              backgroundColor: statusColor + '18',
              borderColor: statusColor + '55',
            },
          ]}
        >
          <View style={[s.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[s.statusText, { color: statusColor }]}>
            {isPaid ? 'PAID' : humanize(paymentStatus).toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>Order Summary</Text>

        <InfoRow
          theme={theme}
          icon="receipt-outline"
          label="Order ID"
          value={`#${shortId(orderId)}`}
        />

        <InfoRow
          theme={theme}
          icon="cube-outline"
          label="Items"
          value={`${itemCount} item${Number(itemCount) === 1 ? '' : 's'}`}
        />

        <InfoRow
          theme={theme}
          icon="timer-outline"
          label="Order Status"
          value={humanize(orderStatus)}
        />

        <InfoRow
          theme={theme}
          icon="card-outline"
          label="Payment Status"
          value={receiptStatus}
        />

        <InfoRow
          theme={theme}
          icon="phone-portrait-outline"
          label="Payment Method"
          value={getPaymentMethodLabel(paymentMethod)}
        />

        <InfoRow
          theme={theme}
          icon="cash-outline"
          label="Total Amount"
          value={formatPeso(totalAmount)}
          strong
        />
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>Payment Summary</Text>

        <InfoRow
          theme={theme}
          icon="wallet-outline"
          label="Amount Paid"
          value={formatPeso(isPaid ? totalAmount : paidAmount)}
          strong={isPaid}
        />

        <InfoRow
          theme={theme}
          icon="calculator-outline"
          label="Remaining Balance"
          value={formatPeso(remainingBalance)}
          strong={!remainingBalance}
        />

        {order.payment_reference || params.paymentReference ? (
          <InfoRow
            theme={theme}
            icon="barcode-outline"
            label="Reference"
            value={order.payment_reference || params.paymentReference}
          />
        ) : null}

        {paidAt ? (
          <InfoRow
            theme={theme}
            icon="checkmark-done-outline"
            label="Paid At"
            value={new Date(paidAt).toLocaleString('en-PH', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          />
        ) : null}

        {checkoutUrl && !isPaid ? (
          <TouchableOpacity
            style={s.payButton}
            onPress={() => Linking.openURL(checkoutUrl)}
          >
            <Ionicons name="open-outline" size={17} color="#111827" />
            <Text style={s.payButtonText}>Open PayMongo Checkout</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {orderItems.length > 0 && (
        <View style={s.card}>
          <Text style={s.cardTitle}>Items Ordered</Text>

          {orderItems.slice(0, 4).map((item, index) => {
            const name = item.parts?.name || item.name || `Item ${index + 1}`;
            const quantity = Number(item.quantity) || 1;
            const unitPrice = Number(item.unit_price) || Number(item.price) || 0;
            const subtotal = Number(item.subtotal) || unitPrice * quantity;

            return (
              <View key={`${name}-${index}`} style={s.itemRow}>
                <View style={s.itemIcon}>
                  <Ionicons name="cube-outline" size={17} color={theme.primaryLight || YELLOW} />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={s.itemName}>{name}</Text>
                  <Text style={s.itemMeta}>
                    {formatPeso(unitPrice)} × {quantity}
                  </Text>
                </View>

                <Text style={s.itemTotal}>{formatPeso(subtotal)}</Text>
              </View>
            );
          })}

          {orderItems.length > 4 && (
            <Text style={s.moreItemsText}>
              +{orderItems.length - 4} more item{orderItems.length - 4 === 1 ? '' : 's'}
            </Text>
          )}
        </View>
      )}

      <View style={s.noticeCard}>
        <Ionicons name="information-circle-outline" size={20} color={theme.primaryLight || YELLOW} />
        <Text style={s.noticeText}>
          {isPaid
            ? 'Your PayMongo payment was recorded. You can track processing updates from Order Details.'
            : 'Your official receipt will appear in Order Details after payment is confirmed.'}
        </Text>
      </View>

      <TouchableOpacity
        style={s.primaryButton}
        onPress={() =>
          navigation.replace('OrderDetails', {
            orderId,
            order,
          })
        }
      >
        <Ionicons name="document-text" size={18} color="#fff" />
        <Text style={s.primaryButtonText}>View Order Details</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={s.secondaryButton}
        onPress={() => navigation.replace('OrderHistory')}
      >
        <Ionicons name="time-outline" size={18} color={theme.text} />
        <Text style={s.secondaryButtonText}>Go to Order History</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={s.linkButton}
        onPress={() => navigation.navigate('ShopHome')}
      >
        <Text style={s.linkButtonText}>Continue Shopping</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function InfoRow({ theme, icon, label, value, strong = false }) {
  const s = styles(theme);

  return (
    <View style={s.infoRow}>
      <View style={s.infoIcon}>
        <Ionicons name={icon} size={18} color={theme.primaryLight || YELLOW} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={s.infoLabel}>{label}</Text>
        <Text style={[s.infoValue, strong && s.infoValueStrong]}>{value || '—'}</Text>
      </View>
    </View>
  );
}

const styles = (theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.bg,
    },
    content: {
      padding: 16,
      paddingBottom: 40,
    },
    heroCard: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 22,
      padding: 24,
      alignItems: 'center',
      marginBottom: 14,
    },
    successIcon: {
      width: 86,
      height: 86,
      borderRadius: 43,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
      shadowColor: YELLOW,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 6,
    },
    title: {
      color: theme.text,
      fontSize: 25,
      fontWeight: '900',
      textAlign: 'center',
    },
    subtitle: {
      color: theme.textSub || theme.textMuted,
      fontSize: 13,
      lineHeight: 20,
      textAlign: 'center',
      marginTop: 8,
    },
    statusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      marginTop: 16,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 13,
      paddingVertical: 7,
    },
    statusDot: {
      width: 7,
      height: 7,
      borderRadius: 999,
    },
    statusText: {
      fontSize: 11,
      fontWeight: '900',
      letterSpacing: 0.5,
    },
    card: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 18,
      padding: 16,
      marginBottom: 14,
    },
    cardTitle: {
      color: theme.text,
      fontSize: 17,
      fontWeight: '900',
      marginBottom: 10,
    },
    infoRow: {
      flexDirection: 'row',
      gap: 12,
      paddingVertical: 11,
      borderTopWidth: 1,
      borderTopColor: theme.border,
    },
    infoIcon: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: (theme.primaryLight || YELLOW) + '16',
      alignItems: 'center',
      justifyContent: 'center',
    },
    infoLabel: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    infoValue: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '800',
      marginTop: 3,
      lineHeight: 19,
    },
    infoValueStrong: {
      color: theme.primaryLight || YELLOW,
      fontSize: 16,
      fontWeight: '900',
    },
    payButton: {
      marginTop: 14,
      backgroundColor: YELLOW,
      borderRadius: 14,
      paddingVertical: 13,
      paddingHorizontal: 14,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    payButtonText: {
      color: '#111827',
      fontSize: 13,
      fontWeight: '900',
    },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 11,
      borderTopWidth: 1,
      borderTopColor: theme.border,
    },
    itemIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: (theme.primaryLight || YELLOW) + '16',
      alignItems: 'center',
      justifyContent: 'center',
    },
    itemName: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '900',
    },
    itemMeta: {
      color: theme.textMuted,
      fontSize: 11,
      marginTop: 2,
      fontWeight: '700',
    },
    itemTotal: {
      color: theme.primaryLight || YELLOW,
      fontSize: 12,
      fontWeight: '900',
    },
    moreItemsText: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '800',
      textAlign: 'center',
      marginTop: 6,
    },
    noticeCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      backgroundColor: theme.bg2,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 16,
      padding: 14,
      marginBottom: 16,
    },
    noticeText: {
      flex: 1,
      color: theme.textSub || theme.textMuted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '600',
    },
    primaryButton: {
      backgroundColor: theme.primary,
      borderRadius: 15,
      paddingVertical: 15,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
      marginBottom: 10,
    },
    primaryButtonText: {
      color: '#fff',
      fontSize: 15,
      fontWeight: '900',
    },
    secondaryButton: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 15,
      paddingVertical: 15,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
      marginBottom: 12,
    },
    secondaryButtonText: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '900',
    },
    linkButton: {
      alignItems: 'center',
      paddingVertical: 8,
    },
    linkButtonText: {
      color: theme.textMuted,
      fontSize: 13,
      fontWeight: '800',
    },
  });
