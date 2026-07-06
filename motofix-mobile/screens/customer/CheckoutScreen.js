import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { notifyRole, notifyUser } from '../../lib/notifications';
import { CONSENT_TYPES, requireCustomerConsent } from '../../lib/consents';
import { useTheme } from '../../lib/ThemeContext';
import { useCart } from '../../lib/CartContext';

function formatPeso(value) {
  const amount = Number(value) || 0;

  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function cleanText(value, maxLength = 300) {
  return String(value || '')
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function cleanMultilineText(value, maxLength = 500) {
  return String(value || '')
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength);
}

function cleanNumericText(value, maxLength = 30) {
  return String(value || '').replace(/\D/g, '').slice(0, maxLength);
}

const PHONE_PREFIX = '09';

function formatPhoneInput(value) {
  const digits = String(value || '').replace(/\D/g, '');

  if (!digits || digits.length <= 2) {
    return PHONE_PREFIX;
  }

  const numberAfterPrefix = digits.startsWith(PHONE_PREFIX)
    ? digits.slice(2)
    : digits;

  return (PHONE_PREFIX + numberAfterPrefix).slice(0, 11);
}

function isValidPhilippineMobile(value) {
  return /^09\d{9}$/.test(value);
}

function getDatabasePaymentMethod(method) {
  const map = {
    cash_on_pickup: 'cash',
    paymongo_qrph: 'gcash',
    gcash_manual: 'gcash',
  };

  return map[method] || 'cash';
}

function getPaymentMethodLabel(method) {
  const labels = {
    cash_on_pickup: 'Pay at Counter',
    paymongo_qrph: 'PayMongo QR Ph / GCash',
    gcash_manual: 'GCash Manual Verification',
  };

  return labels[method] || 'Pay at Counter';
}

export default function CheckoutScreen({ navigation }) {
  const { theme } = useTheme();
  const {
    cart,
    cartTotal,
    updateQuantity,
    removeFromCart,
    clearCart,
    refreshCart,
  } = useCart();

  const [notes, setNotes] = useState('');
  const [contactPhone, setContactPhone] = useState(PHONE_PREFIX);
  const [savedProfilePhone, setSavedProfilePhone] = useState('');
  const [phoneLoading, setPhoneLoading] = useState(true);
  const [editPhone, setEditPhone] = useState(false);
  const [fulfillmentMethod, setFulfillmentMethod] = useState('pickup');
  const [paymentMethod, setPaymentMethod] = useState('cash_on_pickup');
  const [paymentReference, setPaymentReference] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [pickupNotes, setPickupNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [checkingStock, setCheckingStock] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const s = styles(theme);
  // UI payment options are mapped to DB-safe payment_method values before inserting orders.

  useEffect(() => {
    loadSavedProfilePhone();
  }, []);

  async function loadSavedProfilePhone() {
    setPhoneLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id) {
        setSavedProfilePhone('');
        setPhoneLoading(false);
        return '';
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('phone')
        .eq('id', user.id)
        .maybeSingle();

      if (error) throw error;

      const savedPhone = formatPhoneInput(data?.phone || '');

      if (isValidPhilippineMobile(savedPhone)) {
        setSavedProfilePhone(savedPhone);
        setContactPhone(savedPhone);
        setEditPhone(false);
        return savedPhone;
      }

      setSavedProfilePhone('');
      setEditPhone(true);
      return '';
    } catch (error) {
      console.log('LOAD PROFILE PHONE ERROR:', error);
      setSavedProfilePhone('');
      setEditPhone(true);
      return '';
    } finally {
      setPhoneLoading(false);
    }
  }


  const downPaymentRate = 0.15;
  const onlinePaymentAmount =
    paymentMethod === 'paymongo_qrph'
      ? Number(cartTotal.toFixed(2))
      : paymentMethod === 'gcash_manual'
        ? Number((cartTotal * downPaymentRate).toFixed(2))
        : 0;
  const requiredDownPayment = onlinePaymentAmount;
  const remainingBalance = Number((cartTotal - onlinePaymentAmount).toFixed(2));

  async function requireCheckoutConsents() {
    const acceptedTerms = await requireCustomerConsent({
      consentType: CONSENT_TYPES.TERMS,
      title: 'Terms and Conditions',
      message:
        'Before checkout, please accept MotoFix Terms and Conditions, including shop rules, order processing, payment verification, and cancellation policies.',
    });

    if (!acceptedTerms) return false;

    const acceptedPrivacy = await requireCustomerConsent({
      consentType: CONSENT_TYPES.DATA_PRIVACY,
      title: 'Data Privacy Consent',
      message:
        'MotoFix will process your account details, order details, selected products, payment records, and receipt information for order management.',
    });

    if (!acceptedPrivacy) return false;

    const acceptedCheckoutPolicy = await requireCustomerConsent({
      consentType: CONSENT_TYPES.CHECKOUT_POLICY,
      title: 'Checkout Policy',
      message:
        'Please accept the checkout policy. Orders are subject to staff/admin confirmation, stock verification, payment validation, and pickup or release rules.',
    });

    return acceptedCheckoutPolicy;
  }

  async function handleRefresh() {
    setRefreshing(true);

    try {
      if (typeof refreshCart === 'function') {
        await refreshCart();
      }
    } catch (error) {
      console.log('Refresh cart error:', error);
    } finally {
      setRefreshing(false);
    }
  }

  async function validateCartStock() {
    setCheckingStock(true);

    try {
      if (!cart.length) {
        return { ok: false, message: 'Your cart is empty.' };
      }

      const ids = [...new Set(cart.map((item) => item.id).filter(Boolean))];

      const { data, error } = await supabase
        .from('parts')
        .select('id, name, stock_quantity, is_active')
        .in('id', ids);

      if (error) throw error;

      const partsById = new Map((data || []).map((part) => [part.id, part]));

      for (const item of cart) {
        const latest = partsById.get(item.id);

        if (!latest || latest.is_active === false) {
          return {
            ok: false,
            message: `${item.name} is no longer available. Please remove it from your cart.`,
          };
        }

        const stock = Number(latest.stock_quantity) || 0;

        if (stock <= 0) {
          return {
            ok: false,
            message: `${item.name} is already out of stock.`,
          };
        }

        if (Number(item.quantity) > stock) {
          return {
            ok: false,
            message: `Only ${stock} item(s) are available for ${item.name}. Please update the quantity.`,
          };
        }
      }

      return { ok: true };
    } finally {
      setCheckingStock(false);
    }
  }

  async function createOrderQrphCheckout(orderId) {
    const { data, error: invokeError } = await supabase.functions.invoke(
      'create-order-qrph-checkout',
      {
        body: {
          order_id: orderId,
        },
      }
    );

    if (invokeError) {
      throw new Error(invokeError.message || 'Failed to create PayMongo checkout.');
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    if (!data?.checkout_url) {
      throw new Error('PayMongo checkout URL was not returned.');
    }

    return data;
  }

  function confirmRemoveFromCart(item) {
    Alert.alert(
      'Remove Product',
      `Remove "${item.name}" from your cart?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => removeFromCart(item.id),
        },
      ]
    );
  }

  function confirmPlaceOrder() {
    if (cart.length === 0 || submitting || checkingStock) return;

    Alert.alert(
      'Place Order',
      `Submit this order with a total amount of ${formatPeso(cartTotal)} using ${getPaymentMethodLabel(paymentMethod)}?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Submit Order',
          onPress: submitOrder,
        },
      ]
    );
  }

  async function submitOrder() {
    if (cart.length === 0 || submitting) return;

    setSubmitting(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id) {
        setSubmitting(false);
        Alert.alert('Login Required', 'Please login before placing an order.');
        navigation.navigate('Login');
        return;
      }

      let cleanPhone = formatPhoneInput(contactPhone);

      if (!isValidPhilippineMobile(cleanPhone)) {
        const latestSavedPhone = await loadSavedProfilePhone();
        cleanPhone = formatPhoneInput(latestSavedPhone || savedProfilePhone || contactPhone);
      }

      if (!isValidPhilippineMobile(cleanPhone)) {
        setSubmitting(false);
        Alert.alert(
          'Missing Contact Number',
          'Please add a valid phone number in your profile or enter one for this order. It must start with 09 and contain exactly 11 digits.'
        );
        setEditPhone(true);
        return;
      }

      setContactPhone(cleanPhone);

      if (fulfillmentMethod === 'delivery' && !cleanMultilineText(deliveryAddress, 300)) {
        setSubmitting(false);
        Alert.alert('Missing Delivery Address', 'Please enter your delivery address.');
        return;
      }

      const cleanReference = cleanNumericText(paymentReference, 30);

      if (paymentMethod === 'gcash_manual' && cleanReference.length < 6) {
        setSubmitting(false);
        Alert.alert(
          'Invalid GCash Reference',
          'Please enter a valid GCash reference number before submitting.'
        );
        return;
      }

      const consentsAccepted = await requireCheckoutConsents();

      if (!consentsAccepted) {
        setSubmitting(false);
        return;
      }

      const stockCheck = await validateCartStock();

      if (!stockCheck.ok) {
        await refreshCart?.();
        Alert.alert('Stock Updated', stockCheck.message);
        return;
      }

      const paymentStatus =
        paymentMethod === 'gcash_manual' ? 'pending_verification' : 'pending_payment';
      const databasePaymentMethod = getDatabasePaymentMethod(paymentMethod);
      const selectedPaymentLabel = getPaymentMethodLabel(paymentMethod);

      let checkoutData = null;
      let finalPaymentStatus = paymentStatus;

      const fulfillmentStatus =
        fulfillmentMethod === 'delivery' ? 'pending_delivery' : 'pending_pickup';

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          customer_id: user.id,
          total_amount: cartTotal,
          status: 'pending',

          payment_status: paymentStatus,
          payment_method: databasePaymentMethod,
          payment_reference: cleanNumericText(paymentReference, 30) || null,
          // Do not count the amount as paid yet.
          // PayMongo becomes paid only after webhook; GCash manual becomes paid only after staff/admin verification.
          down_payment_amount: 0,
          remaining_balance: cartTotal,

          fulfillment_method: fulfillmentMethod,
          fulfillment_status: fulfillmentStatus,
          delivery_address:
            fulfillmentMethod === 'delivery' ? cleanMultilineText(deliveryAddress, 300) : null,
          pickup_notes:
            fulfillmentMethod === 'pickup' ? cleanText(pickupNotes, 160) || null : null,
          customer_contact_phone: cleanPhone,

          notes:
            cleanMultilineText(
              `${notes ? `${notes}\n\n` : ''}Mobile selected payment option: ${selectedPaymentLabel}`,
              500
            ) || null,
        })
        .select()
        .single();

      if (orderError) throw orderError;

      const orderItems = cart.map((item) => ({
        order_id: order.id,
        part_id: item.id,
        quantity: item.quantity,
        unit_price: Number(item.price) || 0,
        subtotal: (Number(item.price) || 0) * item.quantity,
      }));

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems);

      if (itemsError) throw itemsError;

      for (const item of cart) {
        const { error: stockError } = await supabase.rpc('decrement_stock', {
          part_id: item.id,
          qty: item.quantity,
        });

        if (stockError) throw stockError;
      }

      if (paymentMethod === 'paymongo_qrph') {
        checkoutData = await createOrderQrphCheckout(order.id);
        finalPaymentStatus = 'checkout_created';
      }

      await Promise.allSettled([
        notifyUser({
          userId: user.id,
          title: 'Order Submitted',
          message:
            paymentMethod === 'gcash_manual'
              ? 'Your order was submitted and is waiting for GCash payment verification.'
              : 'Your order was submitted. Please pay at the shop during pickup or release.',
          type: 'order',
          relatedTable: 'orders',
          relatedId: order.id,
        }),

        notifyRole({
          role: 'admin',
          title: 'New Product Order',
          message:
            paymentMethod === 'gcash_manual'
              ? 'A customer submitted a mobile product order with GCash reference for verification.'
              : 'A customer submitted a mobile product order for counter payment.',
          type: 'order',
          relatedTable: 'orders',
          relatedId: order.id,
        }),

        notifyRole({
          role: 'staff',
          title: 'New Product Order',
          message: 'A customer submitted a mobile product order.',
          type: 'order',
          relatedTable: 'orders',
          relatedId: order.id,
        }),
      ]);

      const submittedItems = cart.map((item) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        unit_price: Number(item.price) || 0,
        subtotal: (Number(item.price) || 0) * item.quantity,
        parts: {
          id: item.id,
          name: item.name,
          image_url: item.image_url,
          category: item.category,
        },
      }));

      await clearCart();

      navigation.replace('OrderConfirmation', {
        orderId: order.id,
        order: {
          ...order,
          order_items: submittedItems,
        },
        items: submittedItems,
        itemCount: submittedItems.reduce(
          (sum, item) => sum + (Number(item.quantity) || 0),
          0
        ),
        totalAmount: cartTotal,
        downPayment: 0,
        remainingBalance: cartTotal,
        status: 'pending',
        paymentStatus: finalPaymentStatus,
        paymentMethod: databasePaymentMethod,
        selectedPaymentOption: paymentMethod,
        selectedPaymentLabel,
        fulfillmentMethod,
        checkoutUrl: checkoutData?.checkout_url || null,
        receiptStatus:
          paymentMethod === 'paymongo_qrph'
            ? 'Waiting for PayMongo payment'
            : paymentMethod === 'gcash_manual'
              ? 'Pending GCash verification'
              : 'Pending counter payment',
      });

      if (checkoutData?.checkout_url) {
        await Linking.openURL(checkoutData.checkout_url);
      }
    } catch (error) {
      Alert.alert('Checkout Failed', error.message || 'Unable to submit order.');
    } finally {
      setSubmitting(false);
    }
  }

  function OptionButton({ active, icon, title, subtitle, onPress }) {
    return (
      <TouchableOpacity
        style={[s.optionCard, active && s.optionCardActive]}
        onPress={onPress}
      >
        <View style={s.optionTitleRow}>
          <Text style={s.optionIcon}>{icon}</Text>
          <Text style={s.optionTitle}>{title}</Text>
        </View>
        <Text style={s.optionSubtitle}>{subtitle}</Text>
      </TouchableOpacity>
    );
  }

  if (cart.length === 0) {
    return (
      <View style={s.centered}>
        <Ionicons name="cart-outline" size={54} color={theme.textMuted} />
        <Text style={s.emptyTitle}>Your cart is empty</Text>
        <Text style={s.emptyText}>Add products from the shop before checking out.</Text>

        <TouchableOpacity
          style={s.primaryButton}
          onPress={() => navigation.navigate('ShopHome')}
        >
          <Text style={s.primaryButtonText}>Back to Shop</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={theme.primary}
          colors={[theme.primary]}
        />
      }
    >
      <Text style={s.title}>Checkout</Text>
      <Text style={s.subtitle}>Review your cart, payment, and release method.</Text>

      {cart.map((item) => (
        <View key={item.id} style={s.itemCard}>
          <View style={s.imageBox}>
            {item.image_url ? (
              <Image source={{ uri: item.image_url }} style={s.image} />
            ) : (
              <Ionicons name="image-outline" size={28} color={theme.textMuted} />
            )}
          </View>

          <View style={s.itemInfo}>
            <Text style={s.itemName} numberOfLines={2}>
              {item.name}
            </Text>

            <Text style={s.itemMeta}>
              {formatPeso(item.price)} × {item.quantity}
            </Text>

            <Text style={s.itemTotal}>
              {formatPeso((Number(item.price) || 0) * item.quantity)}
            </Text>

            <Text style={s.stockText}>Stock: {item.stock_quantity}</Text>

            <View style={s.qtyRow}>
              <TouchableOpacity
                style={[
                  s.qtyButton,
                  item.quantity <= 1 && { opacity: 0.45 },
                ]}
                onPress={() => updateQuantity(item.id, item.quantity - 1)}
                disabled={item.quantity <= 1}
              >
                <Text style={s.qtyButtonText}>−</Text>
              </TouchableOpacity>

              <Text style={s.qtyText}>{item.quantity}</Text>

              <TouchableOpacity
                style={[
                  s.qtyButton,
                  item.quantity >= item.stock_quantity && { opacity: 0.45 },
                ]}
                onPress={() => updateQuantity(item.id, item.quantity + 1)}
                disabled={item.quantity >= item.stock_quantity}
              >
                <Text style={s.qtyButtonText}>+</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={s.removeButton}
                onPress={() => confirmRemoveFromCart(item)}
              >
                <Text style={s.removeText}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ))}

      <View style={s.sectionCard}>
        <Text style={s.sectionTitle}>Contact Number</Text>

        {phoneLoading ? (
          <View style={s.savedPhoneBox}>
            <ActivityIndicator size="small" color={theme.primaryLight} />
            <Text style={s.savedPhoneHelp}>Checking saved profile number...</Text>
          </View>
        ) : savedProfilePhone && !editPhone ? (
          <View style={s.savedPhoneBox}>
            <View style={{ flex: 1 }}>
              <Text style={s.savedPhoneLabel}>Using saved profile number</Text>
              <Text style={s.savedPhoneValue}>{savedProfilePhone}</Text>
              <Text style={s.savedPhoneHelp}>
                This number will be used for order updates and delivery/pickup contact.
              </Text>
            </View>

            <TouchableOpacity
              style={s.textButton}
              onPress={() => setEditPhone(true)}
            >
              <Text style={s.textButtonText}>Change</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {!savedProfilePhone && (
              <Text style={s.savedPhoneHelp}>
                No saved phone number was found in your profile. Enter one for this order.
              </Text>
            )}

            <TextInput
              value={contactPhone}
              onChangeText={(value) => setContactPhone(formatPhoneInput(value))}
              placeholder="09XXXXXXXXX"
              placeholderTextColor={theme.textMuted}
              keyboardType="phone-pad"
              maxLength={11}
              style={s.input}
            />

            {savedProfilePhone ? (
              <TouchableOpacity
                style={s.useSavedButton}
                onPress={() => {
                  setContactPhone(savedProfilePhone);
                  setEditPhone(false);
                }}
              >
                <Text style={s.useSavedButtonText}>Use saved number instead</Text>
              </TouchableOpacity>
            ) : null}
          </>
        )}
      </View>

      <View style={s.sectionCard}>
        <Text style={s.sectionTitle}>Fulfillment Method</Text>

        <OptionButton
          active={fulfillmentMethod === 'pickup'}
          icon="🏪"
          title="Pickup at Shop"
          subtitle="Pick up your products at the MotoFix shop."
          onPress={() => setFulfillmentMethod('pickup')}
        />

        <OptionButton
          active={fulfillmentMethod === 'delivery'}
          icon="🛵"
          title="Delivery"
          subtitle="Staff will process the order for delivery/release."
          onPress={() => setFulfillmentMethod('delivery')}
        />

        {fulfillmentMethod === 'delivery' ? (
          <TextInput
            value={deliveryAddress}
            onChangeText={(value) => setDeliveryAddress(cleanMultilineText(value, 300))}
            placeholder="Complete delivery address..."
            placeholderTextColor={theme.textMuted}
            maxLength={300}
            style={[s.input, s.textArea]}
            multiline
          />
        ) : (
          <TextInput
            value={pickupNotes}
            onChangeText={(value) => setPickupNotes(cleanText(value, 160))}
            placeholder="Pickup note, preferred time, or instruction..."
            placeholderTextColor={theme.textMuted}
            maxLength={160}
            style={s.input}
          />
        )}
      </View>

      <View style={s.sectionCard}>
        <Text style={s.sectionTitle}>Payment Method</Text>

        <OptionButton
          active={paymentMethod === 'cash_on_pickup'}
          icon="💵"
          title="Pay at Counter"
          subtitle="Pay at the shop during pickup/release."
          onPress={() => setPaymentMethod('cash_on_pickup')}
        />

        <OptionButton
          active={paymentMethod === 'paymongo_qrph'}
          icon="⚡"
          title="PayMongo QR Ph / GCash"
          subtitle="Pay the full order online. The system updates after webhook confirmation."
          onPress={() => setPaymentMethod('paymongo_qrph')}
        />

        <OptionButton
          active={paymentMethod === 'gcash_manual'}
          icon="📲"
          title="GCash Manual Verification"
          subtitle="Submit your GCash reference number for staff verification."
          onPress={() => setPaymentMethod('gcash_manual')}
        />

        {paymentMethod === 'gcash_manual' && (
          <View style={s.gcashBox}>
            <Text style={s.gcashLabel}>GCash Reference Number</Text>
            <TextInput
              value={paymentReference}
              onChangeText={(value) => setPaymentReference(cleanNumericText(value, 30))}
              placeholder="Example: 1234567890123"
              placeholderTextColor={theme.textMuted}
              keyboardType="number-pad"
              maxLength={30}
              style={s.input}
            />
            <Text style={s.gcashHelp}>
              Required down payment: {formatPeso(requiredDownPayment)}. Staff will verify this before processing.
            </Text>
          </View>
        )}
      </View>

      <View style={s.sectionCard}>
        <Text style={s.sectionTitle}>Order Notes</Text>

        <TextInput
          value={notes}
          onChangeText={(value) => setNotes(cleanMultilineText(value, 500))}
          placeholder="Special instructions..."
          placeholderTextColor={theme.textMuted}
          maxLength={500}
          style={[s.input, s.textArea]}
          multiline
        />
      </View>

      <View style={s.summaryCard}>
        <View style={s.summaryHeader}>
          <View style={s.summaryIcon}>
            <Ionicons
              name="receipt-outline"
              size={22}
              color={theme.primaryLight}
            />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={s.summaryTitle}>Order Summary</Text>
            <Text style={s.summarySubtitle}>
              Stock is checked again before your order is submitted.
            </Text>
          </View>
        </View>

        <View style={s.summaryRow}>
          <Text style={s.summaryLabel}>Total Amount</Text>
          <Text style={s.summaryValue}>{formatPeso(cartTotal)}</Text>
        </View>

        <View style={s.summaryRow}>
          <Text style={s.summaryLabel}>Down Payment</Text>
          <Text style={s.summaryValue}>{formatPeso(requiredDownPayment)}</Text>
        </View>

        <View style={s.summaryRow}>
          <Text style={s.summaryLabel}>Remaining Balance</Text>
          <Text style={s.summaryValue}>{formatPeso(remainingBalance)}</Text>
        </View>

        <View style={s.paymentNoteBox}>
          <Ionicons
            name="information-circle-outline"
            size={17}
            color={theme.textMuted}
          />
          <Text style={s.paymentNote}>
            Staff/Admin will process the order, payment verification, invoice,
            and e-receipt after submission.
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={[s.submitButton, (submitting || checkingStock) && { opacity: 0.7 }]}
        onPress={confirmPlaceOrder}
        disabled={submitting || checkingStock}
      >
        {submitting || checkingStock ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={s.submitButtonText}>Place Order</Text>
        )}
      </TouchableOpacity>

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = (theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    content: { padding: 16 },
    centered: {
      flex: 1,
      backgroundColor: theme.bg,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    title: { color: theme.text, fontSize: 28, fontWeight: '900' },
    subtitle: {
      color: theme.textSub || theme.textMuted,
      marginTop: 4,
      marginBottom: 16,
    },
    emptyTitle: {
      color: theme.text,
      fontSize: 20,
      fontWeight: '900',
      marginTop: 12,
    },
    emptyText: {
      color: theme.textSub || theme.textMuted,
      textAlign: 'center',
      marginTop: 6,
    },
    primaryButton: {
      marginTop: 18,
      backgroundColor: theme.primary,
      paddingHorizontal: 18,
      paddingVertical: 12,
      borderRadius: 12,
    },
    primaryButtonText: { color: '#fff', fontWeight: '900' },
    itemCard: {
      flexDirection: 'row',
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 16,
      padding: 12,
      marginBottom: 12,
    },
    imageBox: {
      width: 78,
      height: 78,
      borderRadius: 14,
      backgroundColor: theme.bg2,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      marginRight: 12,
    },
    image: { width: '100%', height: '100%' },
    itemInfo: { flex: 1 },
    itemName: { color: theme.text, fontSize: 15, fontWeight: '900' },
    itemMeta: {
      color: theme.textSub || theme.textMuted,
      fontSize: 12,
      marginTop: 4,
    },
    itemTotal: {
      color: theme.primaryLight,
      fontWeight: '900',
      marginTop: 5,
    },
    stockText: {
      color: theme.textMuted,
      fontSize: 11,
      marginTop: 4,
    },
    qtyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 10,
    },
    qtyButton: {
      width: 30,
      height: 30,
      borderRadius: 9,
      backgroundColor: theme.bg2,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    qtyButtonText: { color: theme.text, fontSize: 18, fontWeight: '900' },
    qtyText: { color: theme.text, fontWeight: '900', marginHorizontal: 12 },
    removeButton: { marginLeft: 14 },
    removeText: { color: theme.danger, fontWeight: '800', fontSize: 12 },
    sectionCard: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 16,
      padding: 14,
      marginTop: 4,
      marginBottom: 12,
    },
    sectionTitle: {
      color: theme.text,
      fontWeight: '900',
      marginBottom: 10,
    },
    savedPhoneBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: theme.bg2,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 14,
      padding: 12,
    },
    savedPhoneLabel: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    savedPhoneValue: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '900',
      marginTop: 3,
    },
    savedPhoneHelp: {
      color: theme.textSub || theme.textMuted,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 4,
    },
    textButton: {
      borderWidth: 1,
      borderColor: theme.primary,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    textButtonText: {
      color: theme.primaryLight || theme.primary,
      fontSize: 12,
      fontWeight: '900',
    },
    useSavedButton: {
      alignSelf: 'flex-start',
      marginTop: 10,
    },
    useSavedButtonText: {
      color: theme.primaryLight || theme.primary,
      fontSize: 12,
      fontWeight: '900',
    },
    input: {
      color: theme.text,
      backgroundColor: theme.bg2,
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: theme.border,
      marginTop: 8,
    },
    textArea: {
      minHeight: 90,
      textAlignVertical: 'top',
    },
    optionCard: {
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.bg2,
      borderRadius: 14,
      padding: 12,
      marginBottom: 10,
    },
    optionCardActive: {
      borderColor: theme.primary,
      backgroundColor: theme.primary + '15',
    },
    optionTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 4,
    },
    optionIcon: { fontSize: 18 },
    optionTitle: {
      color: theme.text,
      fontWeight: '900',
      fontSize: 14,
    },
    optionSubtitle: {
      color: theme.textSub || theme.textMuted,
      fontSize: 12,
      lineHeight: 17,
    },
    gcashBox: {
      backgroundColor: theme.primary + '12',
      borderWidth: 1,
      borderColor: theme.primary + '33',
      borderRadius: 14,
      padding: 12,
      marginTop: 6,
    },
    gcashLabel: {
      color: theme.primaryLight,
      fontWeight: '900',
      fontSize: 12,
      textTransform: 'uppercase',
    },
    gcashHelp: {
      color: theme.textSub || theme.textMuted,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 8,
    },
    summaryCard: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 16,
      padding: 16,
      marginBottom: 14,
    },
    summaryHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 14,
    },
    summaryIcon: {
      width: 42,
      height: 42,
      borderRadius: 13,
      backgroundColor: theme.bg2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    summaryTitle: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '900',
    },
    summarySubtitle: {
      color: theme.textMuted,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 2,
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 10,
      gap: 12,
    },
    summaryLabel: {
      color: theme.textSub || theme.textMuted,
      flex: 1,
    },
    summaryValue: { color: theme.text, fontWeight: '900' },
    paymentNoteBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      backgroundColor: theme.bg2,
      borderRadius: 12,
      padding: 11,
      marginTop: 8,
      borderWidth: 1,
      borderColor: theme.border,
    },
    paymentNote: {
      color: theme.textMuted,
      fontSize: 12,
      lineHeight: 18,
      flex: 1,
    },
    submitButton: {
      backgroundColor: theme.primary,
      borderRadius: 15,
      paddingVertical: 15,
      alignItems: 'center',
    },
    submitButtonText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  });
