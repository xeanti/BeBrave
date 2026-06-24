import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';
import { useCart } from '../../lib/CartContext';

function formatPeso(value) {
  const amount = Number(value) || 0;
  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function CheckoutScreen({ navigation }) {
  const { theme } = useTheme();
  const { cart, cartTotal, updateQuantity, removeFromCart, clearCart } = useCart();

  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const s = styles(theme);

  const downPaymentRate = 0.15;
  const downPayment = cartTotal * downPaymentRate;
  const remainingBalance = cartTotal - downPayment;

  async function placeOrder() {
    if (cart.length === 0 || submitting) return;

    setSubmitting(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id) {
        Alert.alert('Login Required', 'Please login before placing an order.');
        navigation.navigate('Login');
        return;
      }

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          customer_id: user.id,
          total_amount: cartTotal,
          status: 'pending',
          notes,
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

      const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
      if (itemsError) throw itemsError;

      for (const item of cart) {
        const { error: stockError } = await supabase.rpc('decrement_stock', {
          part_id: item.id,
          qty: item.quantity,
        });

        if (stockError) throw stockError;
      }

      clearCart();

      Alert.alert(
        'Order Submitted',
        'Your parts order has been submitted. Please wait for admin or staff confirmation.',
        [{ text: 'OK', onPress: () => navigation.replace('OrderHistory') }]
      );
    } catch (error) {
      Alert.alert('Checkout Failed', error.message || 'Unable to submit order.');
    } finally {
      setSubmitting(false);
    }
  }

  if (cart.length === 0) {
    return (
      <View style={s.centered}>
        <Ionicons name="cart-outline" size={54} color={theme.textMuted} />
        <Text style={s.emptyTitle}>Your cart is empty</Text>
        <Text style={s.emptyText}>Add parts from the shop before checking out.</Text>

        <TouchableOpacity style={s.primaryButton} onPress={() => navigation.navigate('ShopHome')}>
          <Text style={s.primaryButtonText}>Back to Shop</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.title}>Checkout</Text>
      <Text style={s.subtitle}>Review your parts order before submitting.</Text>

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
            <Text style={s.itemTotal}>{formatPeso(item.price * item.quantity)}</Text>

            <View style={s.qtyRow}>
              <TouchableOpacity
                style={s.qtyButton}
                onPress={() => updateQuantity(item.id, item.quantity - 1)}
                disabled={item.quantity <= 1}
              >
                <Text style={s.qtyButtonText}>−</Text>
              </TouchableOpacity>

              <Text style={s.qtyText}>{item.quantity}</Text>

              <TouchableOpacity
                style={s.qtyButton}
                onPress={() => updateQuantity(item.id, item.quantity + 1)}
              >
                <Text style={s.qtyButtonText}>+</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.removeButton} onPress={() => removeFromCart(item.id)}>
                <Text style={s.removeText}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ))}

      <View style={s.notesCard}>
        <Text style={s.label}>Order Notes</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Example: Please prepare for pickup this weekend."
          placeholderTextColor={theme.textMuted}
          style={s.notesInput}
          multiline
        />
      </View>

      <View style={s.summaryCard}>
        <View style={s.summaryRow}>
          <Text style={s.summaryLabel}>Total Amount</Text>
          <Text style={s.summaryValue}>{formatPeso(cartTotal)}</Text>
        </View>

        <View style={s.summaryRow}>
          <Text style={s.summaryLabel}>Suggested Down Payment 15%</Text>
          <Text style={s.summaryValue}>{formatPeso(downPayment)}</Text>
        </View>

        <View style={s.summaryRow}>
          <Text style={s.summaryLabel}>Remaining Balance</Text>
          <Text style={s.summaryValue}>{formatPeso(remainingBalance)}</Text>
        </View>

        <Text style={s.paymentNote}>
          Payment verification and digital receipt can be connected next. For now, this submits the order to admin/staff.
        </Text>
      </View>

      <TouchableOpacity
        style={[s.submitButton, submitting && { opacity: 0.7 }]}
        onPress={placeOrder}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={s.submitButtonText}>Submit Order</Text>
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
    subtitle: { color: theme.textSub, marginTop: 4, marginBottom: 16 },
    emptyTitle: { color: theme.text, fontSize: 20, fontWeight: '900', marginTop: 12 },
    emptyText: { color: theme.textSub, textAlign: 'center', marginTop: 6 },
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
    itemMeta: { color: theme.textSub, fontSize: 12, marginTop: 4 },
    itemTotal: { color: theme.primaryLight, fontWeight: '900', marginTop: 5 },
    qtyRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
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
    notesCard: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 16,
      padding: 14,
      marginTop: 4,
      marginBottom: 12,
    },
    label: { color: theme.text, fontWeight: '900', marginBottom: 8 },
    notesInput: {
      minHeight: 90,
      color: theme.text,
      textAlignVertical: 'top',
      backgroundColor: theme.bg2,
      borderRadius: 12,
      padding: 12,
    },
    summaryCard: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 16,
      padding: 16,
      marginBottom: 14,
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 10,
      gap: 12,
    },
    summaryLabel: { color: theme.textSub, flex: 1 },
    summaryValue: { color: theme.text, fontWeight: '900' },
    paymentNote: { color: theme.textMuted, fontSize: 12, lineHeight: 18, marginTop: 6 },
    submitButton: {
      backgroundColor: theme.primary,
      borderRadius: 15,
      paddingVertical: 15,
      alignItems: 'center',
    },
    submitButtonText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  });