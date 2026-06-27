import React from 'react';
import {
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

function getItemCount(items = []) {
  return items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
}

export default function OrderConfirmationScreen({ route, navigation }) {
  const { theme, isDark } = useTheme();
  const s = styles(theme);
  const params = route?.params || {};

  const order = params.order || {};
  const orderId = params.orderId || order.id;
  const totalAmount = params.totalAmount || order.total_amount || 0;
  const itemCount = params.itemCount || getItemCount(params.items || order.order_items || []);
  const status = params.status || order.status || 'pending';
  const receiptStatus = params.receiptStatus || 'Pending shop confirmation';
  const orderItems = params.items || order.order_items || [];

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.bg}
      />

      <View style={s.heroCard}>
        <View style={s.successIcon}>
          <Ionicons name="bag-check" size={40} color="#111827" />
        </View>

        <Text style={s.title}>Order Submitted!</Text>
        <Text style={s.subtitle}>
          Your parts order was sent to MotoFix. Staff will verify stock and payment before release.
        </Text>

        <View style={s.statusPill}>
          <View style={s.statusDot} />
          <Text style={s.statusText}>{String(status).toUpperCase()}</Text>
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
          icon="card-outline"
          label="Receipt Status"
          value={receiptStatus}
        />

        <InfoRow
          theme={theme}
          icon="cash-outline"
          label="Total Amount"
          value={formatPeso(totalAmount)}
          strong
        />
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
          Your official receipt will appear in Order Details after staff/admin records payment.
          You can still track the order now from Order History.
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
      backgroundColor: YELLOW,
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
      backgroundColor: (theme.warning || YELLOW) + '18',
      borderColor: (theme.warning || YELLOW) + '55',
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 13,
      paddingVertical: 7,
    },
    statusDot: {
      width: 7,
      height: 7,
      borderRadius: 999,
      backgroundColor: theme.warning || YELLOW,
    },
    statusText: {
      color: theme.warning || YELLOW,
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
