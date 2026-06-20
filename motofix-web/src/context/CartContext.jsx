import { createContext, useContext, useState, useEffect } from 'react';

const CartContext = createContext(null);

const CART_KEY = 'motofix_cart';

export function CartProvider({ children }) {
  const [cart, setCart] = useState(() => {
    try {
      const saved = localStorage.getItem(CART_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Sync to localStorage whenever cart changes
  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart]);

  function addToCart(part, quantity = 1) {
    const qty = Math.max(1, parseInt(quantity) || 1);
    setCart((prev) => {
      const existing = prev.find((item) => item.id === part.id);
      if (existing) {
        return prev.map((item) =>
          item.id === part.id ? { ...item, quantity: item.quantity + qty } : item
        );
      }
      return [...prev, { ...part, quantity: qty }];
    });
  }

  function removeFromCart(partId) {
    setCart((prev) => prev.filter((item) => item.id !== partId));
  }

  function updateQuantity(partId, quantity) {
    if (quantity < 1) {
      removeFromCart(partId);
      return;
    }
    setCart((prev) =>
      prev.map((item) => (item.id === partId ? { ...item, quantity } : item))
    );
  }

  function clearCart() {
    setCart([]);
    localStorage.removeItem(CART_KEY);
  }

  const total = cart.reduce((sum, item) => sum + parseFloat(item.price) * item.quantity, 0);
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider value={{ cart, addToCart, removeFromCart, updateQuantity, clearCart, total, itemCount }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used within CartProvider');
  return context;
}