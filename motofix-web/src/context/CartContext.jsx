import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { supabase } from '../lib/supabaseClient';
import { alertAction } from '../components/ConfirmModal';

const CartContext = createContext(null);

function money(value) {
  return Number(value) || 0;
}

function showMessage(title, message) {
  const normalizedTitle = title || 'Notice';
  const danger = /error|failed|unavailable/i.test(normalizedTitle);

  void alertAction({
    title: normalizedTitle,
    message,
    confirmLabel: 'Okay',
    tone: danger ? 'danger' : 'warning',
  });
}

function normalizeCartRow(row, part) {
  const stock = Number(part?.stock_quantity) || 0;
  const quantity = Math.max(1, Number(row.quantity) || 1);

  return {
    cart_item_id: row.id,
    id: row.part_id,
    part_id: row.part_id,
    name: part?.name || 'Product',
    category: part?.category || 'General',
    description: part?.description || '',
    image_url: part?.image_url || null,
    price: money(part?.price),
    stock_quantity: stock,
    compatible_models: Array.isArray(part?.compatible_models)
      ? part.compatible_models
      : [],
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
      return [];
    }

    setLoadingCart(true);

    try {
      const { data: cartRows, error: cartError } = await supabase
        .from('cart_items')
        .select('id, user_id, part_id, quantity, created_at, updated_at')
        .eq('user_id', uid)
        .order('created_at', { ascending: true });

      if (cartError) throw cartError;

      const rows = cartRows || [];

      if (rows.length === 0) {
        setCart([]);
        return [];
      }

      const partIds = [...new Set(rows.map((row) => row.part_id).filter(Boolean))];

      const { data: partsData, error: partsError } = await supabase
        .from('parts')
        .select(
          'id, name, category, image_url, price, stock_quantity, compatible_models, is_active'
        )
        .in('id', partIds);

      if (partsError) throw partsError;

      const partsById = new Map((partsData || []).map((part) => [part.id, part]));

      const invalidPartIds = [];
      const normalized = [];

      for (const row of rows) {
        const part = partsById.get(row.part_id);

        if (!part || part.is_active === false || Number(part.stock_quantity) <= 0) {
          invalidPartIds.push(row.part_id);
          continue;
        }

        normalized.push(normalizeCartRow(row, part));
      }

      if (invalidPartIds.length > 0) {
        await supabase
          .from('cart_items')
          .delete()
          .eq('user_id', uid)
          .in('part_id', invalidPartIds);
      }

      setCart(normalized);
      return normalized;
    } catch (error) {
      console.log('Fetch cart error:', error?.message || error);
      setCart([]);
      return [];
    } finally {
      setLoadingCart(false);
    }
  }, []);

  const refreshCart = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const uid = data?.session?.user?.id || null;

    setUserId(uid);
    return fetchCart(uid);
  }, [fetchCart]);

  useEffect(() => {
    let mounted = true;

    async function initCart() {
      const { data } = await supabase.auth.getSession();
      const uid = data?.session?.user?.id || null;

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
      .channel(`web-cart-${userId}`)
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
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'parts',
        },
        () => fetchCart(userId)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetchCart]);

  async function getCurrentUserId() {
    if (userId) return userId;

    const { data, error } = await supabase.auth.getSession();

    if (error) {
      console.log('Get session error:', error.message);
      return null;
    }

    const uid = data?.session?.user?.id || null;
    setUserId(uid);
    return uid;
  }

  async function addToCart(part, quantity = 1) {
    const uid = await getCurrentUserId();

    if (!uid) {
      showMessage('Login Required', 'Please login before adding items to your cart.');
      return { ok: false, error: 'Please login before adding items to your cart.' };
    }

    const partId = part?.id || part?.part_id;

    if (!partId) {
      showMessage('Cart Error', 'Missing product ID.');
      return { ok: false, error: 'Missing product ID.' };
    }

    const qty = Math.max(1, parseInt(quantity, 10) || 1);
    const stock = Number(part?.stock_quantity) || 0;

    if (stock <= 0) {
      showMessage('Out of Stock', `${part?.name || 'This product'} is currently out of stock.`);
      return { ok: false, error: 'Out of stock.' };
    }

    const currentCart = await fetchCart(uid);
    const currentQty =
      currentCart.find((item) => item.id === partId || item.part_id === partId)?.quantity || 0;

    if (currentQty + qty > stock) {
      const message = `Stock limit reached. Only ${stock} item(s) available for ${part?.name || 'this product'}.`;
      showMessage('Stock Limit', message);
      return { ok: false, error: message };
    }

    const { data: existingItem, error: existingError } = await supabase
      .from('cart_items')
      .select('id, quantity')
      .eq('user_id', uid)
      .eq('part_id', partId)
      .maybeSingle();

    if (existingError) {
      console.log('Cart existing item error:', existingError);
      showMessage('Cart Error', existingError.message);
      return { ok: false, error: existingError.message };
    }

    if (existingItem) {
      const nextQty = Math.min(Number(existingItem.quantity || 0) + qty, stock);

      const { error: updateError } = await supabase
        .from('cart_items')
        .update({
          quantity: nextQty,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingItem.id);

      if (updateError) {
        console.log('Cart update error:', updateError);
        showMessage('Cart Error', updateError.message);
        return { ok: false, error: updateError.message };
      }
    } else {
      const { error: insertError } = await supabase.from('cart_items').insert({
        user_id: uid,
        part_id: partId,
        quantity: qty,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (insertError) {
        console.log('Cart insert error:', insertError);
        showMessage('Cart Error', insertError.message);
        return { ok: false, error: insertError.message };
      }
    }

    const updatedCart = await fetchCart(uid);

    return {
      ok: true,
      message: `${qty} × ${part?.name || 'Product'} added to cart.`,
      cart: updatedCart,
    };
  }

  async function removeFromCart(partId) {
    const uid = await getCurrentUserId();
    if (!uid) return { ok: false, error: 'Not logged in.' };

    const { error } = await supabase
      .from('cart_items')
      .delete()
      .eq('user_id', uid)
      .eq('part_id', partId);

    if (error) {
      showMessage('Cart Error', error.message);
      return { ok: false, error: error.message };
    }

    await fetchCart(uid);
    return { ok: true };
  }

  async function updateQuantity(partId, quantity) {
    const uid = await getCurrentUserId();
    if (!uid) return { ok: false, error: 'Not logged in.' };

    if (Number(quantity) < 1) {
      return removeFromCart(partId);
    }

    const item = cart.find((cartItem) => cartItem.id === partId || cartItem.part_id === partId);
    if (!item) return { ok: false, error: 'Item not found in cart.' };

    const qty = Math.max(1, parseInt(quantity, 10) || 1);
    const safeQty = Math.min(qty, item.stock_quantity || qty);

    const { error } = await supabase
      .from('cart_items')
      .update({
        quantity: safeQty,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', uid)
      .eq('part_id', partId);

    if (error) {
      showMessage('Cart Error', error.message);
      return { ok: false, error: error.message };
    }

    await fetchCart(uid);
    return { ok: true };
  }

  async function clearCart() {
    const uid = await getCurrentUserId();

    if (!uid) {
      setCart([]);
      return { ok: true };
    }

    const { error } = await supabase
      .from('cart_items')
      .delete()
      .eq('user_id', uid);

    if (error) {
      showMessage('Cart Error', error.message);
      return { ok: false, error: error.message };
    }

    setCart([]);
    return { ok: true };
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

        total: cartTotal,
        itemCount: cartTotalItems,

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
