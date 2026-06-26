import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Alert } from 'react-native';
import { supabase } from './supabase';

const CartContext = createContext(null);

function money(value) {
  return Number(value) || 0;
}

function normalizeCartRow(row) {
  const part = row.parts || {};
  const stock = Number(part.stock_quantity) || 0;
  const quantity = Math.max(1, Number(row.quantity) || 1);

  return {
    cart_item_id: row.id,
    id: row.part_id,
    part_id: row.part_id,
    name: part.name || 'Part',
    category: part.category || 'General',
    description: part.description || '',
    image_url: part.image_url || null,
    price: money(part.price),
    stock_quantity: stock,
    compatible_models: part.compatible_models || [],
    quantity: stock > 0 ? Math.min(quantity, stock) : quantity,
  };
}

export function CartProvider({ children }) {
  const [cart, setCart] = useState([]);
  const [userId, setUserId] = useState(null);
  const [loadingCart, setLoadingCart] = useState(true);

  const fetchCart = useCallback(async (uid) => {
    if (!uid) {
      setCart([]);
      setLoadingCart(false);
      return;
    }

    setLoadingCart(true);

    const { data, error } = await supabase
      .from('cart_items')
      .select(`
        id,
        user_id,
        part_id,
        quantity,
        parts (
          id,
          name,
          category,
          description,
          image_url,
          price,
          stock_quantity,
          compatible_models
        )
      `)
      .eq('user_id', uid)
      .order('created_at', { ascending: true });

    if (error) {
      console.log('Fetch cart error:', error.message);
      setCart([]);
    } else {
      setCart((data || []).map(normalizeCartRow));
    }

    setLoadingCart(false);
  }, []);

  const refreshCart = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    const uid = data?.user?.id || null;

    setUserId(uid);
    await fetchCart(uid);
  }, [fetchCart]);

  useEffect(() => {
    let mounted = true;

    async function initCart() {
      const { data } = await supabase.auth.getUser();
      const uid = data?.user?.id || null;

      if (!mounted) return;

      setUserId(uid);
      await fetchCart(uid);
    }

    initCart();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const uid = session?.user?.id || null;
        setUserId(uid);
        await fetchCart(uid);
      }
    );

    return () => {
      mounted = false;
      authListener?.subscription?.unsubscribe?.();
    };
  }, [fetchCart]);

  useEffect(() => {
    if (!userId) return undefined;

    const channel = supabase
      .channel(`mobile-cart-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'cart_items',
          filter: `user_id=eq.${userId}`,
        },
        () => fetchCart(userId)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetchCart]);

  async function addToCart(part, quantity = 1) {
    if (!userId) {
      Alert.alert('Login Required', 'Please login before adding items to your cart.');
      return;
    }

    const qty = Math.max(1, Number(quantity) || 1);
    const stock = Number(part.stock_quantity) || 0;

    if (stock <= 0) {
      Alert.alert('Out of Stock', `${part.name} is currently unavailable.`);
      return;
    }

    const { error } = await supabase.rpc('add_to_cart', {
      p_user_id: userId,
      p_part_id: part.id,
      p_quantity: qty,
    });

    if (error) {
      Alert.alert('Cart Error', error.message);
      return;
    }

    await fetchCart(userId);
  }

  async function updateQuantity(partId, quantity) {
    if (!userId) return;

    const item = cart.find((cartItem) => cartItem.id === partId);

    if (!item) return;

    const qty = Math.max(1, Number(quantity) || 1);
    const safeQty = Math.min(qty, item.stock_quantity || qty);

    const { error } = await supabase
      .from('cart_items')
      .update({
        quantity: safeQty,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('part_id', partId);

    if (error) {
      Alert.alert('Cart Error', error.message);
      return;
    }

    await fetchCart(userId);
  }

  async function removeFromCart(partId) {
    if (!userId) return;

    const { error } = await supabase
      .from('cart_items')
      .delete()
      .eq('user_id', userId)
      .eq('part_id', partId);

    if (error) {
      Alert.alert('Cart Error', error.message);
      return;
    }

    await fetchCart(userId);
  }

  async function clearCart() {
    if (!userId) {
      setCart([]);
      return;
    }

    const { error } = await supabase
      .from('cart_items')
      .delete()
      .eq('user_id', userId);

    if (error) {
      Alert.alert('Cart Error', error.message);
      return;
    }

    setCart([]);
  }

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + money(item.price) * item.quantity, 0),
    [cart]
  );

  const cartTotalItems = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart]
  );

  return (
    <CartContext.Provider
      value={{
        cart,
        loadingCart,
        cartTotal,
        cartTotalItems,
        addToCart,
        updateQuantity,
        removeFromCart,
        clearCart,
        refreshCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const value = useContext(CartContext);

  if (!value) {
    throw new Error('useCart must be used inside CartProvider');
  }

  return value;
}