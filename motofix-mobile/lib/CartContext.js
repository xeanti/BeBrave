import React, { createContext, useContext, useMemo, useState } from 'react';

const CartContext = createContext(null);

function money(value) {
  return Number(value) || 0;
}

export function CartProvider({ children }) {
  const [cart, setCart] = useState([]);

  function addToCart(part, quantity = 1) {
    const qty = Math.max(1, Number(quantity) || 1);
    const stock = Number(part.stock_quantity) || 0;

    setCart((current) => {
      const existing = current.find((item) => item.id === part.id);

      if (existing) {
        const nextQty = Math.min(existing.quantity + qty, stock || existing.quantity + qty);

        return current.map((item) =>
          item.id === part.id
            ? { ...item, quantity: nextQty }
            : item
        );
      }

      return [
        ...current,
        {
          id: part.id,
          name: part.name,
          category: part.category,
          description: part.description,
          image_url: part.image_url,
          price: money(part.price),
          stock_quantity: stock,
          compatible_models: part.compatible_models || [],
          quantity: Math.min(qty, stock || qty),
        },
      ];
    });
  }

  function updateQuantity(partId, quantity) {
    const qty = Math.max(1, Number(quantity) || 1);

    setCart((current) =>
      current.map((item) =>
        item.id === partId
          ? { ...item, quantity: Math.min(qty, item.stock_quantity || qty) }
          : item
      )
    );
  }

  function removeFromCart(partId) {
    setCart((current) => current.filter((item) => item.id !== partId));
  }

  function clearCart() {
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
        cartTotal,
        cartTotalItems,
        addToCart,
        updateQuantity,
        removeFromCart,
        clearCart,
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