import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { supabase } from '../lib/supabaseClient';

function formatPeso(value) {
  const amount = Number(value) || 0;

  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function normalizeText(value) {
  return String(value || '').toLowerCase().trim();
}

function getStockStatus(part) {
  const stock = Number(part.stock_quantity) || 0;
  const threshold = Number(part.reorder_threshold ?? 5);

  if (stock <= 0) {
    return {
      label: 'Out of stock',
      classes:
        'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25',
    };
  }

  if (stock <= threshold) {
    return {
      label: `Only ${stock} left`,
      classes:
        'bg-yellow-50 text-yellow-700 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25',
    };
  }

  return {
    label: `${stock} in stock`,
    classes:
      'bg-green-50 text-green-700 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25',
  };
}

function ProductSkeleton() {
  return (
    <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-dark-700 dark:bg-dark-800">
      <div className="h-44 animate-pulse bg-gray-100 dark:bg-dark-900" />
      <div className="space-y-3 p-4">
        <div className="h-4 w-3/4 animate-pulse rounded bg-gray-100 dark:bg-dark-900" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-gray-100 dark:bg-dark-900" />
        <div className="h-8 w-full animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-900" />
        <div className="h-10 w-full animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-900" />
      </div>
    </div>
  );
}

export default function Shop() {
  const { profile } = useAuth();
  const { addToCart, cart } = useCart();

  const [parts, setParts] = useState([]);
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [partsError, setPartsError] = useState('');

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [selectedModel, setSelectedModel] = useState('all');
  const [sortBy, setSortBy] = useState('name_asc');
  const [cartMessage, setCartMessage] = useState('');
  const [quantities, setQuantities] = useState({});

  const profileModel = useMemo(() => {
    const value = `${profile?.moto_make || ''} ${profile?.moto_model || ''}`.trim();
    return value || '';
  }, [profile]);

  useEffect(() => {
    fetchParts();
    fetchModels();

    const channel = supabase
      .channel('shop-parts-refresh')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'parts' },
        () => fetchParts(false)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchParts(showLoader = true) {
    if (showLoader) setLoading(true);

    setPartsError('');

    const { data, error } = await supabase
      .from('parts')
      .select('*')
      .eq('is_active', true)
      .gt('stock_quantity', 0)
      .order('name', { ascending: true });

    if (error) {
      setPartsError(error.message || 'Failed to load parts.');
      setParts([]);
    } else {
      setParts(data || []);
    }

    setLoading(false);
  }

  async function fetchModels() {
    const { data } = await supabase
      .from('motorcycle_models')
      .select('id, make, model')
      .order('make', { ascending: true });

    if (data) setModels(data);
  }

  function getQty(partId) {
    return quantities[partId] || 1;
  }

  function setQty(partId, qty, max) {
    const limit = Math.max(Number(max) || 1, 1);
    const safeQty = Number.isFinite(Number(qty)) ? Number(qty) : 1;
    const clamped = Math.min(Math.max(1, safeQty), limit);

    setQuantities((previous) => ({
      ...previous,
      [partId]: clamped,
    }));
  }

  function getCartQty(partId) {
    return cart.find((item) => item.id === partId)?.quantity || 0;
  }

  function handleAddToCart(part) {
    const qty = getQty(part.id);
    const alreadyInCart = getCartQty(part.id);
    const stock = Number(part.stock_quantity) || 0;

    if (alreadyInCart + qty > stock) {
      setCartMessage(`Only ${stock} ${stock === 1 ? 'item is' : 'items are'} available for ${part.name}.`);
      setTimeout(() => setCartMessage(''), 2500);
      return;
    }

    addToCart(part, qty);
    setCartMessage(`${qty} × ${part.name} added to cart!`);
    setQuantities((previous) => ({ ...previous, [part.id]: 1 }));
    setTimeout(() => setCartMessage(''), 2500);
  }

  function clearFilters() {
    setSearch('');
    setCategory('all');
    setSelectedModel('all');
    setSortBy('name_asc');
  }

  const modelOptions = useMemo(() => {
    const options = models.map((model) => `${model.make} ${model.model}`);
    const unique = [...new Set(options)].sort();

    if (profileModel && !unique.includes(profileModel)) {
      unique.unshift(profileModel);
    }

    return unique;
  }, [models, profileModel]);

  const categories = useMemo(() => {
    const counts = parts.reduce(
      (acc, part) => {
        const key = part.category || 'General';
        acc[key] = (acc[key] || 0) + 1;
        acc.all += 1;
        return acc;
      },
      { all: 0 }
    );

    const list = Object.keys(counts)
      .filter((key) => key !== 'all')
      .sort((a, b) => a.localeCompare(b));

    return [
      { name: 'all', count: counts.all },
      ...list.map((name) => ({ name, count: counts[name] })),
    ];
  }, [parts]);

  const filteredParts = useMemo(() => {
    const query = normalizeText(search);

    const filtered = parts.filter((part) => {
      const compatibleModels = part.compatible_models || [];
      const searchable = [
        part.name,
        part.category,
        part.description,
        ...compatibleModels,
      ]
        .filter(Boolean)
        .join(' ');

      const matchSearch = !query || normalizeText(searchable).includes(query);
      const matchCategory = category === 'all' || (part.category || 'General') === category;
      const matchModel =
        selectedModel === 'all' ||
        compatibleModels.some((model) => normalizeText(model) === normalizeText(selectedModel));

      return matchSearch && matchCategory && matchModel;
    });

    return [...filtered].sort((a, b) => {
      const priceA = Number(a.price) || 0;
      const priceB = Number(b.price) || 0;
      const stockA = Number(a.stock_quantity) || 0;
      const stockB = Number(b.stock_quantity) || 0;

      if (sortBy === 'price_low') return priceA - priceB;
      if (sortBy === 'price_high') return priceB - priceA;
      if (sortBy === 'stock_high') return stockB - stockA;
      if (sortBy === 'stock_low') return stockA - stockB;

      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  }, [parts, search, category, selectedModel, sortBy]);

  const cartItemIds = useMemo(() => cart.map((item) => item.id), [cart]);
  const cartTotalItems = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart]
  );

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gray-50 px-4 py-8 text-gray-900 dark:bg-dark-900 dark:text-white sm:px-6 lg:py-10">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8 overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-dark-700 dark:bg-dark-800">
          <div className="relative p-6 sm:p-8">
            <div className="absolute -right-8 -top-14 h-36 w-36 rounded-full bg-primary-500/10 blur-3xl" />
            <div className="absolute -bottom-16 left-10 h-36 w-36 rounded-full bg-accent-500/10 blur-3xl" />

            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="mb-2 text-xs font-black uppercase tracking-[0.25em] text-primary-600 dark:text-primary-400">
                  MotoFix Parts Shop
                </p>
                <h1 className="text-3xl font-black tracking-tight text-gray-950 dark:text-white md:text-4xl">
                  Parts Shop
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-400">
                  Browse available motorcycle parts, filter by model compatibility, and add items directly to your cart.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:flex">
                <div className="rounded-2xl bg-gray-50 px-4 py-3 text-center ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                  <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Available Parts
                  </p>
                  <p className="text-lg font-black text-gray-950 dark:text-white">
                    {parts.length}
                  </p>
                </div>
                <div className="rounded-2xl bg-gray-50 px-4 py-3 text-center ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                  <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    In Cart
                  </p>
                  <p className="text-lg font-black text-primary-600 dark:text-primary-400">
                    {cartTotalItems}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Cart message toast */}
        {cartMessage && (
          <div className="fixed bottom-6 right-6 z-50 max-w-sm rounded-2xl border border-green-200 bg-white px-4 py-3 text-sm font-bold text-green-700 shadow-2xl shadow-gray-900/10 ring-1 ring-green-100 dark:border-green-500/25 dark:bg-dark-800 dark:text-green-300 dark:ring-green-500/20">
            <div className="flex items-center gap-2">
              <span>🛒</span>
              <span>{cartMessage}</span>
            </div>
          </div>
        )}

        {/* Error */}
        {partsError && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {partsError}
          </div>
        )}

        {/* Filters */}
        <section className="mb-6 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm dark:border-dark-700 dark:bg-dark-800">
          <div className="grid gap-3 lg:grid-cols-[1fr_220px_180px_auto]">
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                🔍
              </span>
              <input
                type="text"
                placeholder="Search parts, categories, or compatible models..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-10 py-3 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:placeholder:text-gray-500 dark:focus:border-primary-500"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-400 transition hover:text-gray-700 dark:hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>

            <select
              value={selectedModel}
              onChange={(event) => setSelectedModel(event.target.value)}
              className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:focus:border-primary-500"
            >
              <option value="all">All Models</option>
              {modelOptions.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
              className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:focus:border-primary-500"
            >
              <option value="name_asc">Sort: Name</option>
              <option value="price_low">Price: Low to High</option>
              <option value="price_high">Price: High to Low</option>
              <option value="stock_high">Stock: High to Low</option>
              <option value="stock_low">Stock: Low to High</option>
            </select>

            <button
              type="button"
              onClick={clearFilters}
              className="rounded-2xl border border-gray-200 px-4 py-3 text-sm font-bold text-gray-700 transition hover:border-primary-300 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300 dark:hover:border-primary-500/40 dark:hover:text-primary-300"
            >
              Clear
            </button>
          </div>

          {profileModel && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                Your motorcycle:
              </span>
              <button
                type="button"
                onClick={() => setSelectedModel(profileModel)}
                className={`rounded-full px-3 py-1 text-xs font-black transition ${
                  selectedModel === profileModel
                    ? 'bg-primary-600 text-white'
                    : 'bg-primary-50 text-primary-700 hover:bg-primary-100 dark:bg-primary-900/25 dark:text-primary-300 dark:hover:bg-primary-900/40'
                }`}
              >
                🏍️ {profileModel}
              </button>
            </div>
          )}
        </section>

        {/* Category tabs */}
        <div className="mb-6 flex flex-wrap gap-2">
          {categories.map((item) => {
            const active = category === item.name;
            const label = item.name === 'all' ? 'All' : item.name;

            return (
              <button
                key={item.name}
                onClick={() => setCategory(item.name)}
                className={`rounded-full px-4 py-2 text-xs font-black capitalize transition ${
                  active
                    ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20'
                    : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:text-gray-900 dark:bg-dark-800 dark:text-gray-400 dark:ring-dark-700 dark:hover:text-white'
                }`}
              >
                {label}
                <span className={active ? 'ml-1 opacity-80' : 'ml-1 opacity-60'}>
                  ({item.count})
                </span>
              </button>
            );
          })}
        </div>

        {/* Results count */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">
            <span className="font-black text-gray-950 dark:text-white">
              {filteredParts.length}
            </span>{' '}
            {filteredParts.length === 1 ? 'part' : 'parts'} found
            {selectedModel !== 'all' ? (
              <span>
                {' '}
                for <span className="text-primary-600 dark:text-primary-400">{selectedModel}</span>
              </span>
            ) : null}
          </p>
        </div>

        {/* Parts grid */}
        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((item) => (
              <ProductSkeleton key={item} />
            ))}
          </div>
        ) : filteredParts.length === 0 ? (
          <div className="rounded-3xl border border-gray-200 bg-white p-12 text-center shadow-sm dark:border-dark-700 dark:bg-dark-800">
            <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-3xl bg-primary-50 text-4xl ring-1 ring-primary-100 dark:bg-primary-900/20 dark:ring-primary-500/20">
              🔍
            </div>
            <h2 className="mb-2 text-xl font-black text-gray-950 dark:text-white">
              No parts found
            </h2>
            <p className="mx-auto max-w-md text-sm leading-6 text-gray-600 dark:text-gray-400">
              Try a different search keyword, category, model, or clear all filters.
            </p>
            <button
              type="button"
              onClick={clearFilters}
              className="mt-5 rounded-2xl bg-primary-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700"
            >
              Clear Filters
            </button>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredParts.map((part) => {
              const inCart = cartItemIds.includes(part.id);
              const stockStatus = getStockStatus(part);
              const qty = getQty(part.id);
              const cartQty = getCartQty(part.id);
              const availableToAdd = Math.max((Number(part.stock_quantity) || 0) - cartQty, 0);
              const canAdd = availableToAdd > 0;

              return (
                <article
                  key={part.id}
                  className="group overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm transition hover:-translate-y-1 hover:border-primary-200 hover:shadow-xl hover:shadow-gray-200/60 dark:border-dark-700 dark:bg-dark-800 dark:hover:border-primary-500/30 dark:hover:shadow-black/20"
                >
                  {/* Part image */}
                  <div className="relative h-48 overflow-hidden bg-gray-100 dark:bg-dark-900">
                    {part.image_url ? (
                      <img
                        src={part.image_url}
                        alt={part.name}
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-5xl text-gray-400">
                        ⚙️
                      </div>
                    )}

                    <div className="absolute left-3 top-3">
                      <span className={`rounded-full px-3 py-1 text-xs font-black ring-1 ${stockStatus.classes}`}>
                        {stockStatus.label}
                      </span>
                    </div>

                    {inCart && (
                      <div className="absolute right-3 top-3 rounded-full bg-green-600 px-3 py-1 text-xs font-black text-white shadow-lg">
                        ✓ In Cart
                      </div>
                    )}
                  </div>

                  {/* Part info */}
                  <div className="flex min-h-[280px] flex-col p-4">
                    <div className="flex-1">
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <h2 className="line-clamp-2 text-sm font-black leading-5 text-gray-950 dark:text-white">
                          {part.name}
                        </h2>
                      </div>

                      <span className="mb-3 inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-bold capitalize text-gray-600 dark:bg-dark-900 dark:text-gray-400">
                        {part.category || 'General'}
                      </span>

                      {/* Compatible models */}
                      {part.compatible_models?.length > 0 ? (
                        <div className="mb-3">
                          <p className="mb-2 text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Compatible with
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {part.compatible_models.slice(0, 2).map((model) => (
                              <span
                                key={model}
                                className="rounded-full bg-primary-50 px-2.5 py-1 text-[11px] font-bold text-primary-700 dark:bg-primary-900/25 dark:text-primary-300"
                              >
                                {model}
                              </span>
                            ))}
                            {part.compatible_models.length > 2 && (
                              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-bold text-gray-500 dark:bg-dark-900 dark:text-gray-400">
                                +{part.compatible_models.length - 2} more
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                          No model compatibility listed.
                        </p>
                      )}
                    </div>

                    <div className="mt-4 border-t border-gray-100 pt-4 dark:border-dark-700">
                      <p className="mb-3 text-2xl font-black text-accent-600 dark:text-accent-400">
                        {formatPeso(part.price)}
                      </p>

                      {/* Quantity stepper */}
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div className="flex items-center rounded-2xl border border-gray-200 bg-gray-50 p-1 dark:border-dark-700 dark:bg-dark-900">
                          <button
                            type="button"
                            onClick={() => setQty(part.id, qty - 1, availableToAdd || part.stock_quantity)}
                            disabled={!canAdd}
                            className="grid h-8 w-8 place-items-center rounded-xl text-sm font-black text-gray-600 transition hover:bg-white hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-300 dark:hover:bg-dark-800 dark:hover:text-white"
                          >
                            −
                          </button>

                          <input
                            type="number"
                            min={1}
                            max={availableToAdd || part.stock_quantity}
                            value={canAdd ? qty : 0}
                            disabled={!canAdd}
                            onChange={(event) =>
                              setQty(part.id, parseInt(event.target.value, 10) || 1, availableToAdd || part.stock_quantity)
                            }
                            className="h-8 w-11 bg-transparent text-center text-sm font-black text-gray-950 outline-none disabled:opacity-40 dark:text-white"
                          />

                          <button
                            type="button"
                            onClick={() => setQty(part.id, qty + 1, availableToAdd || part.stock_quantity)}
                            disabled={!canAdd}
                            className="grid h-8 w-8 place-items-center rounded-xl text-sm font-black text-gray-600 transition hover:bg-white hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-300 dark:hover:bg-dark-800 dark:hover:text-white"
                          >
                            +
                          </button>
                        </div>

                        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                          {cartQty > 0 ? `${cartQty} in cart` : `${part.stock_quantity} stock`}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleAddToCart(part)}
                        disabled={!canAdd}
                        className={`w-full rounded-2xl px-4 py-3 text-sm font-black transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 ${
                          inCart
                            ? 'border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-500/25 dark:bg-green-500/10 dark:text-green-300 dark:hover:bg-green-500/20'
                            : 'bg-primary-600 text-white shadow-lg shadow-primary-600/20 hover:bg-primary-700'
                        }`}
                      >
                        {!canAdd
                          ? 'Max Stock in Cart'
                          : inCart
                          ? `✓ Add ${qty} More`
                          : `+ Add ${qty} to Cart`}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
