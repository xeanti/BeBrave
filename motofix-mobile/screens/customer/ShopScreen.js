import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
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
import { useTheme } from '../../lib/ThemeContext';
import { useCart } from '../../lib/CartContext';

function formatPeso(value) {
  const amount = Number(value) || 0;

  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function normalize(value) {
  return String(value || '').toLowerCase().trim();
}

function getCompatibleModels(part) {
  return Array.isArray(part.compatible_models) ? part.compatible_models : [];
}

function getStockLabel(part, inCart = 0) {
  const stock = Number(part.stock_quantity) || 0;
  const available = Math.max(stock - inCart, 0);

  if (stock <= 0) return 'Out of stock';
  if (available <= 0) return 'All stock in cart';
  if (stock <= 5) return `Only ${available} left`;
  return `${available} available`;
}

export default function ShopScreen({ navigation }) {
  const { theme } = useTheme();
  const { cart, cartTotalItems, cartTotal, addToCart } = useCart();

  const [parts, setParts] = useState([]);
  const [models, setModels] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [selectedModel, setSelectedModel] = useState('all');
  const [sortBy, setSortBy] = useState('name');

  const [sortOpen, setSortOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [messageModal, setMessageModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [selectedPart, setSelectedPart] = useState(null);
  const [detailQty, setDetailQty] = useState(1);

  const s = styles(theme);

  const sortOptions = [
    { id: 'name', label: 'Name A-Z' },
    { id: 'price_low', label: 'Price: Low to High' },
    { id: 'price_high', label: 'Price: High to Low' },
    { id: 'stock_high', label: 'Highest Stock' },
  ];

  const selectedSortLabel =
    sortOptions.find((item) => item.id === sortBy)?.label || 'Name A-Z';

  const selectedCategoryLabel = category === 'all' ? 'All Categories' : category;
  const selectedModelLabel = selectedModel === 'all' ? 'All Motorcycles' : selectedModel;

  function showMessage(type, title, message) {
    setMessageModal({
      type,
      title,
      message,
    });
  }

  function closeMessage() {
    setMessageModal(null);
  }

  function getCategoryCount(item) {
    if (item === 'all') return parts.length;
    return parts.filter((part) => (part.category || 'General') === item).length;
  }

  function getModelCount(item) {
    if (item === 'all') return parts.length;

    return parts.filter((part) =>
      getCompatibleModels(part).some((model) => normalize(model) === normalize(item))
    ).length;
  }

  const hasActiveFilters =
    Boolean(search.trim()) || category !== 'all' || selectedModel !== 'all' || sortBy !== 'name';

  useEffect(() => {
    fetchShop();

    const channel = supabase
      .channel('mobile-shop-products-refresh')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'parts' },
        () => fetchShop(false)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchShop(showLoader = true) {
    if (showLoader) setLoading(true);

    const { data: partsData, error: partsError } = await supabase
      .from('parts')
      .select('*')
      .eq('is_active', true)
      .gt('stock_quantity', 0)
      .order('name', { ascending: true });

    const { data: modelsData } = await supabase
      .from('motorcycle_models')
      .select('id, make, model')
      .order('make', { ascending: true })
      .order('model', { ascending: true });

    if (partsError) {
      showMessage('error', 'Shop Error', partsError.message || 'Failed to load products.');
      setParts([]);
    } else {
      setParts(partsData || []);
    }

    setModels(modelsData || []);
    setLoading(false);
    setRefreshing(false);
  }

  async function onRefresh() {
    setRefreshing(true);
    await fetchShop(false);
  }

  const categories = useMemo(() => {
    const list = [...new Set(parts.map((part) => part.category || 'General'))];
    return ['all', ...list.sort()];
  }, [parts]);

  const modelOptions = useMemo(() => {
    const fromModels = models.map((item) => `${item.make} ${item.model}`);
    const fromParts = parts.flatMap((part) => getCompatibleModels(part));

    return [
      'all',
      ...new Set([...fromModels, ...fromParts].filter(Boolean).sort()),
    ];
  }, [models, parts]);

  const filteredParts = useMemo(() => {
    const query = normalize(search);

    const filtered = parts.filter((part) => {
      const compatibleModels = getCompatibleModels(part);

      const searchable = [
        part.name,
        part.category,
        part.description,
        ...compatibleModels,
      ]
        .filter(Boolean)
        .join(' ');

      const matchSearch = !query || normalize(searchable).includes(query);

      const matchCategory =
        category === 'all' || (part.category || 'General') === category;

      const matchModel =
        selectedModel === 'all' ||
        compatibleModels.some(
          (model) => normalize(model) === normalize(selectedModel)
        );

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
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  }, [parts, search, category, selectedModel, sortBy]);

  function cartQty(partId) {
    return cart.find((item) => item.id === partId)?.quantity || 0;
  }

  function clearFilters() {
    setSearch('');
    setCategory('all');
    setSelectedModel('all');
    setSortBy('name');
  }

  async function handleAdd(part, qty = 1) {
    const alreadyInCart = cartQty(part.id);
    const stock = Number(part.stock_quantity) || 0;

    if (stock <= 0) {
      showMessage('error', 'Out of Stock', `${part.name} is currently unavailable.`);
      return false;
    }

    if (alreadyInCart + qty > stock) {
      showMessage(
        'error',
        'Stock Limit',
        `Only ${stock} ${stock === 1 ? 'item is' : 'items are'} available for ${part.name}.`
      );
      return false;
    }

    const ok = await addToCart(part, qty);

    if (ok !== false) {
      showMessage('success', 'Added to Cart', `${qty} × ${part.name} added to your cart.`);
      return true;
    }

    return false;
  }

  function openDetails(part) {
    const available = Math.max((Number(part.stock_quantity) || 0) - cartQty(part.id), 0);
    setSelectedPart(part);
    setDetailQty(available > 0 ? 1 : 0);
  }

  function closeDetails() {
    setSelectedPart(null);
    setDetailQty(1);
  }

  function changeDetailQty(nextQty) {
    if (!selectedPart) return;

    const available = Math.max(
      (Number(selectedPart.stock_quantity) || 0) - cartQty(selectedPart.id),
      0
    );
    const safeQty = Math.min(Math.max(1, Number(nextQty) || 1), Math.max(available, 1));
    setDetailQty(available > 0 ? safeQty : 0);
  }

  async function addSelectedProduct() {
    if (!selectedPart || detailQty < 1) return;

    const ok = await handleAdd(selectedPart, detailQty);
    if (ok) closeDetails();
  }

  function renderCompatibility(part) {
    const compatibleModels = getCompatibleModels(part);

    if (compatibleModels.length === 0) {
      return (
        <Text style={s.compatibilityText} numberOfLines={1}>
          Fits: Universal / Not specified
        </Text>
      );
    }

    if (selectedModel !== 'all') {
      return (
        <Text style={s.compatibilityText} numberOfLines={1}>
          ✓ Fits {selectedModel}
        </Text>
      );
    }

    return (
      <Text style={s.compatibilityText} numberOfLines={1}>
        Fits: {compatibleModels.slice(0, 2).join(', ')}
        {compatibleModels.length > 2 ? ` +${compatibleModels.length - 2}` : ''}
      </Text>
    );
  }

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={theme.primaryLight} />
        <Text style={s.loadingText}>Loading shop...</Text>
      </View>
    );
  }

  const selectedAvailable = selectedPart
    ? Math.max((Number(selectedPart.stock_quantity) || 0) - cartQty(selectedPart.id), 0)
    : 0;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.kicker}>MotoFix Product Shop</Text>
          <Text style={s.title}>Shop</Text>
          <Text style={s.subtitle}>
            Browse products, check compatibility, and review your order before checkout.
          </Text>
        </View>

        <View style={s.headerActions}>
          <TouchableOpacity
            style={s.historyButton}
            onPress={() => navigation.navigate('OrderHistory')}
          >
            <Ionicons name="receipt-outline" size={20} color={theme.text} />
          </TouchableOpacity>

          <TouchableOpacity
            style={s.historyButton}
            onPress={() => navigation.navigate('Checkout')}
          >
            <Ionicons name="cart-outline" size={20} color={theme.text} />
            {cartTotalItems > 0 && (
              <View style={s.headerCartBadge}>
                <Text style={s.headerCartBadgeText}>{cartTotalItems}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={s.searchRow}>
        <Ionicons name="search" size={18} color={theme.textMuted} />

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search products, category, or model..."
          placeholderTextColor={theme.textMuted}
          style={s.searchInput}
        />

        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={theme.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={s.sortSection}>
        <View>
          <Text style={s.resultText}>{filteredParts.length} product(s)</Text>
          <Text style={s.sortHint}>
            {hasActiveFilters ? 'Filtered product results' : 'Choose how products are arranged'}
          </Text>
        </View>

        <TouchableOpacity
          style={s.sortDropdown}
          onPress={() => setSortOpen(true)}
          activeOpacity={0.85}
        >
          <View style={{ flex: 1 }}>
            <Text style={s.sortLabel}>Sort by</Text>
            <Text style={s.sortValue} numberOfLines={1}>
              {selectedSortLabel}
            </Text>
          </View>

          <Ionicons name="chevron-down" size={18} color={theme.text} />
        </TouchableOpacity>
      </View>

      <View style={s.filterSelectors}>
        <TouchableOpacity
          style={s.filterDropdown}
          onPress={() => setCategoryOpen(true)}
          activeOpacity={0.85}
        >
          <View style={s.filterIconBox}>
            <Ionicons name="grid-outline" size={17} color={theme.primaryLight || theme.primary} />
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.filterLabel}>Category</Text>
            <Text style={s.filterValue} numberOfLines={1}>
              {selectedCategoryLabel}
            </Text>
          </View>

          <Ionicons name="chevron-down" size={17} color={theme.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={s.filterDropdown}
          onPress={() => setModelOpen(true)}
          activeOpacity={0.85}
        >
          <View style={s.filterIconBox}>
            <Ionicons name="bicycle-outline" size={17} color={theme.primaryLight || theme.primary} />
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.filterLabel}>Motorcycle</Text>
            <Text style={s.filterValue} numberOfLines={1}>
              {selectedModelLabel}
            </Text>
          </View>

          <Ionicons name="chevron-down" size={17} color={theme.textMuted} />
        </TouchableOpacity>
      </View>

      {hasActiveFilters && (
        <View style={s.filterInfoCard}>
          <View style={s.filterInfoHeader}>
            <Text style={s.filterInfoText}>
              Showing {filteredParts.length} of {parts.length} product(s)
            </Text>

            <TouchableOpacity onPress={clearFilters}>
              <Text style={s.clearFiltersText}>Clear filters</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.activeChipsContent}
          >
            {search.trim() ? (
              <View style={s.activeChip}>
                <Ionicons name="search" size={13} color={theme.primaryLight || theme.primary} />
                <Text style={s.activeChipText} numberOfLines={1}>“{search.trim()}”</Text>
              </View>
            ) : null}

            {category !== 'all' ? (
              <View style={s.activeChip}>
                <Ionicons name="grid-outline" size={13} color={theme.primaryLight || theme.primary} />
                <Text style={s.activeChipText} numberOfLines={1}>{category}</Text>
              </View>
            ) : null}

            {selectedModel !== 'all' ? (
              <View style={s.activeChip}>
                <Ionicons name="bicycle-outline" size={13} color={theme.primaryLight || theme.primary} />
                <Text style={s.activeChipText} numberOfLines={1}>{selectedModel}</Text>
              </View>
            ) : null}

            {sortBy !== 'name' ? (
              <View style={s.activeChip}>
                <Ionicons name="swap-vertical" size={13} color={theme.primaryLight || theme.primary} />
                <Text style={s.activeChipText} numberOfLines={1}>{selectedSortLabel}</Text>
              </View>
            ) : null}
          </ScrollView>
        </View>
      )}

      <FlatList
        data={filteredParts}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={s.gridRow}
        contentContainerStyle={s.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.primaryLight}
          />
        }
        ListEmptyComponent={
          <View style={s.emptyCard}>
            <Ionicons name="cube-outline" size={38} color={theme.textMuted} />
            <Text style={s.emptyTitle}>No products found</Text>
            <Text style={s.emptyText}>
              Try another search, category, or motorcycle model filter.
            </Text>

            <TouchableOpacity style={s.clearButton} onPress={clearFilters}>
              <Text style={s.clearButtonText}>Clear Filters</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => {
          const inCart = cartQty(item.id);
          const stock = Number(item.stock_quantity) || 0;
          const lowStock = stock > 0 && stock <= 5;
          const canAdd = inCart < stock;

          return (
            <View style={s.card}>
              <TouchableOpacity style={s.imageBox} onPress={() => openDetails(item)}>
                {item.image_url ? (
                  <Image
                    source={{ uri: item.image_url }}
                    style={s.image}
                    resizeMode="cover"
                  />
                ) : (
                  <Ionicons
                    name="image-outline"
                    size={30}
                    color={theme.textMuted}
                  />
                )}

                <View style={[s.stockBadge, lowStock ? s.lowStockBadge : s.inStockBadge]}>
                  <Text style={[s.stockBadgeText, !lowStock && s.inStockText]}>
                    {lowStock ? 'Low Stock' : 'In Stock'}
                  </Text>
                </View>
              </TouchableOpacity>

              <Text style={s.partName} numberOfLines={2}>
                {item.name}
              </Text>

              <Text style={s.categoryText}>{item.category || 'General'}</Text>

              {renderCompatibility(item)}

              <Text style={s.price}>{formatPeso(item.price)}</Text>

              <Text style={s.stock}>
                {inCart > 0
                  ? `${inCart} in cart · ${getStockLabel(item, inCart)}`
                  : getStockLabel(item, 0)}
              </Text>

              <TouchableOpacity style={s.detailsButton} onPress={() => openDetails(item)}>
                <Text style={s.detailsButtonText}>View Details</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  s.addButton,
                  inCart > 0 && s.addButtonAdded,
                  !canAdd && s.addButtonDisabled,
                ]}
                onPress={() => handleAdd(item, 1)}
                disabled={!canAdd}
              >
                <Text style={s.addButtonText}>
                  {!canAdd
                    ? 'Stock Limit'
                    : inCart > 0
                      ? 'Add More'
                      : 'Add to Cart'}
                </Text>
              </TouchableOpacity>
            </View>
          );
        }}
      />

      {cartTotalItems > 0 && (
        <TouchableOpacity
          style={s.cartBar}
          onPress={() => navigation.navigate('Checkout')}
        >
          <View>
            <Text style={s.cartTitle}>{cartTotalItems} item(s) in cart</Text>
            <Text style={s.cartSub}>{formatPeso(cartTotal)} · Review checkout</Text>
          </View>

          <Ionicons name="arrow-forward" size={22} color="#fff" />
        </TouchableOpacity>
      )}

      <Modal
        visible={sortOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSortOpen(false)}
      >
        <TouchableOpacity
          style={s.sortOverlay}
          activeOpacity={1}
          onPress={() => setSortOpen(false)}
        >
          <View style={s.sortSheet}>
            <View style={s.sortSheetHeader}>
              <View>
                <Text style={s.modalKicker}>Sort Products</Text>
                <Text style={s.sortSheetTitle}>Select sorting</Text>
              </View>

              <TouchableOpacity
                style={s.closeButton}
                onPress={() => setSortOpen(false)}
              >
                <Ionicons name="close" size={20} color={theme.text} />
              </TouchableOpacity>
            </View>

            {sortOptions.map((item) => {
              const active = sortBy === item.id;

              return (
                <TouchableOpacity
                  key={item.id}
                  style={[s.sortOption, active && s.sortOptionActive]}
                  onPress={() => {
                    setSortBy(item.id);
                    setSortOpen(false);
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={[s.sortOptionText, active && s.sortOptionTextActive]}>
                    {item.label}
                  </Text>

                  {active ? (
                    <Ionicons name="checkmark-circle" size={21} color={theme.primaryLight || theme.primary} />
                  ) : (
                    <Ionicons name="ellipse-outline" size={21} color={theme.textMuted} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={categoryOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCategoryOpen(false)}
      >
        <TouchableOpacity
          style={s.sortOverlay}
          activeOpacity={1}
          onPress={() => setCategoryOpen(false)}
        >
          <View style={s.filterSheet}>
            <View style={s.sortSheetHeader}>
              <View>
                <Text style={s.modalKicker}>Filter Products</Text>
                <Text style={s.sortSheetTitle}>Select category</Text>
              </View>

              <TouchableOpacity
                style={s.closeButton}
                onPress={() => setCategoryOpen(false)}
              >
                <Ionicons name="close" size={20} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={s.optionList}>
              {categories.map((item) => {
                const active = category === item;
                const label = item === 'all' ? 'All Categories' : item;

                return (
                  <TouchableOpacity
                    key={item}
                    style={[s.sortOption, active && s.sortOptionActive]}
                    onPress={() => {
                      setCategory(item);
                      setCategoryOpen(false);
                    }}
                    activeOpacity={0.85}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        style={[s.sortOptionText, active && s.sortOptionTextActive]}
                        numberOfLines={1}
                      >
                        {label}
                      </Text>
                      <Text style={s.optionCount}>{getCategoryCount(item)} product(s)</Text>
                    </View>

                    {active ? (
                      <Ionicons name="checkmark-circle" size={21} color={theme.primaryLight || theme.primary} />
                    ) : (
                      <Ionicons name="ellipse-outline" size={21} color={theme.textMuted} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={modelOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setModelOpen(false)}
      >
        <TouchableOpacity
          style={s.sortOverlay}
          activeOpacity={1}
          onPress={() => setModelOpen(false)}
        >
          <View style={s.filterSheet}>
            <View style={s.sortSheetHeader}>
              <View>
                <Text style={s.modalKicker}>Filter Products</Text>
                <Text style={s.sortSheetTitle}>Select motorcycle</Text>
              </View>

              <TouchableOpacity
                style={s.closeButton}
                onPress={() => setModelOpen(false)}
              >
                <Ionicons name="close" size={20} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={s.optionList}>
              {modelOptions.map((item) => {
                const active = selectedModel === item;
                const label = item === 'all' ? 'All Motorcycles' : item;

                return (
                  <TouchableOpacity
                    key={item}
                    style={[s.sortOption, active && s.sortOptionActive]}
                    onPress={() => {
                      setSelectedModel(item);
                      setModelOpen(false);
                    }}
                    activeOpacity={0.85}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        style={[s.sortOptionText, active && s.sortOptionTextActive]}
                        numberOfLines={1}
                      >
                        {label}
                      </Text>
                      <Text style={s.optionCount}>{getModelCount(item)} product(s)</Text>
                    </View>

                    {active ? (
                      <Ionicons name="checkmark-circle" size={21} color={theme.primaryLight || theme.primary} />
                    ) : (
                      <Ionicons name="ellipse-outline" size={21} color={theme.textMuted} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={!!messageModal}
        transparent
        animationType="fade"
        onRequestClose={closeMessage}
      >
        <View style={s.messageOverlay}>
          <View style={s.messageCard}>
            <View
              style={[
                s.messageIcon,
                messageModal?.type === 'success' ? s.messageIconSuccess : s.messageIconError,
              ]}
            >
              <Ionicons
                name={messageModal?.type === 'success' ? 'checkmark-circle' : 'warning'}
                size={34}
                color={messageModal?.type === 'success' ? (theme.success || '#22c55e') : (theme.danger || '#ef4444')}
              />
            </View>

            <Text style={s.messageTitle}>{messageModal?.title || 'Message'}</Text>
            <Text style={s.messageText}>{messageModal?.message || ''}</Text>

            <TouchableOpacity
              style={[
                s.messageButton,
                messageModal?.type === 'success' ? s.messageButtonSuccess : s.messageButtonError,
              ]}
              onPress={closeMessage}
            >
              <Text style={s.messageButtonText}>Okay</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!selectedPart}
        transparent
        animationType="slide"
        onRequestClose={closeDetails}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.modalKicker}>Product Details</Text>
                <Text style={s.modalTitle} numberOfLines={2}>
                  {selectedPart?.name}
                </Text>
              </View>

              <TouchableOpacity style={s.closeButton} onPress={closeDetails}>
                <Ionicons name="close" size={20} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={s.modalImageBox}>
                {selectedPart?.image_url ? (
                  <Image
                    source={{ uri: selectedPart.image_url }}
                    style={s.modalImage}
                    resizeMode="cover"
                  />
                ) : (
                  <Ionicons name="image-outline" size={40} color={theme.textMuted} />
                )}
              </View>

              <Text style={s.modalPrice}>{formatPeso(selectedPart?.price)}</Text>

              <Text style={s.modalSectionTitle}>Description</Text>
              <Text style={s.modalText}>
                {selectedPart?.description || 'No description provided.'}
              </Text>

              <Text style={s.modalSectionTitle}>Compatibility</Text>
              {getCompatibleModels(selectedPart || {}).length > 0 ? (
                <View style={s.compatibilityWrap}>
                  {getCompatibleModels(selectedPart || {}).map((model) => (
                    <View key={model} style={s.modelBadge}>
                      <Text style={s.modelBadgeText}>{model}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={s.modalText}>Universal / Not specified</Text>
              )}

              <View style={s.stockBox}>
                <Ionicons name="cube-outline" size={18} color={theme.primaryLight} />
                <Text style={s.stockBoxText}>
                  {selectedAvailable > 0
                    ? `${selectedAvailable} available for checkout`
                    : 'No remaining stock available to add'}
                </Text>
              </View>

              <View style={s.qtySection}>
                <Text style={s.modalSectionTitle}>Quantity</Text>

                <View style={s.qtyControl}>
                  <TouchableOpacity
                    style={[s.qtyButton, detailQty <= 1 && { opacity: 0.45 }]}
                    onPress={() => changeDetailQty(detailQty - 1)}
                    disabled={detailQty <= 1}
                  >
                    <Text style={s.qtyButtonText}>−</Text>
                  </TouchableOpacity>

                  <Text style={s.qtyText}>{detailQty}</Text>

                  <TouchableOpacity
                    style={[
                      s.qtyButton,
                      detailQty >= selectedAvailable && { opacity: 0.45 },
                    ]}
                    onPress={() => changeDetailQty(detailQty + 1)}
                    disabled={detailQty >= selectedAvailable}
                  >
                    <Text style={s.qtyButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                style={[s.modalAddButton, selectedAvailable <= 0 && s.addButtonDisabled]}
                onPress={addSelectedProduct}
                disabled={selectedAvailable <= 0}
              >
                <Text style={s.modalAddButtonText}>
                  {selectedAvailable <= 0
                    ? 'Stock Limit Reached'
                    : `Add ${detailQty} to Cart · ${formatPeso((Number(selectedPart?.price) || 0) * detailQty)}`}
                </Text>
              </TouchableOpacity>

              {cartTotalItems > 0 && (
                <TouchableOpacity
                  style={s.modalCheckoutButton}
                  onPress={() => {
                    closeDetails();
                    navigation.navigate('Checkout');
                  }}
                >
                  <Ionicons name="cart-outline" size={17} color={theme.text} />
                  <Text style={s.modalCheckoutText}>Review Cart / Checkout</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = (theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.bg,
    },
    loadingText: {
      color: theme.textSub || theme.textMuted,
      marginTop: 10,
    },
    header: {
      paddingHorizontal: 18,
      paddingTop: 20,
      paddingBottom: 12,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 12,
    },
    kicker: {
      color: theme.primaryLight,
      fontSize: 11,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    title: {
      color: theme.text,
      fontSize: 28,
      fontWeight: '900',
      marginTop: 3,
    },
    subtitle: {
      color: theme.textSub || theme.textMuted,
      fontSize: 13,
      marginTop: 3,
      maxWidth: 280,
    },
    headerActions: {
      flexDirection: 'row',
      gap: 8,
    },
    historyButton: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    headerCartBadge: {
      position: 'absolute',
      top: -5,
      right: -5,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
      borderWidth: 1,
      borderColor: theme.bg,
    },
    headerCartBadgeText: {
      color: '#fff',
      fontSize: 10,
      fontWeight: '900',
    },
    searchRow: {
      marginHorizontal: 16,
      marginBottom: 10,
      borderRadius: 14,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
    },
    searchInput: {
      flex: 1,
      paddingVertical: 12,
      marginLeft: 8,
      color: theme.text,
    },
    sortSection: {
      marginHorizontal: 16,
      marginBottom: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    resultText: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '900',
    },
    sortHint: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
      marginTop: 2,
    },
    sortDropdown: {
      minWidth: 165,
      maxWidth: 190,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    sortLabel: {
      color: theme.textMuted,
      fontSize: 10,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    sortValue: {
      color: theme.text,
      fontSize: 12,
      fontWeight: '900',
      marginTop: 2,
    },
    filterSelectors: {
      marginHorizontal: 16,
      marginBottom: 12,
      flexDirection: 'row',
      gap: 10,
    },
    filterDropdown: {
      flex: 1,
      minWidth: 0,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    filterIconBox: {
      width: 34,
      height: 34,
      borderRadius: 12,
      backgroundColor: (theme.primary || '#EAB308') + '15',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    filterLabel: {
      color: theme.textMuted,
      fontSize: 10,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    filterValue: {
      color: theme.text,
      fontSize: 12,
      fontWeight: '900',
      marginTop: 3,
    },
    pillScroll: {
      flexGrow: 0,
      flexShrink: 0,
    },
    chipsContent: {
      paddingHorizontal: 16,
      paddingRight: 24,
      gap: 8,
      paddingBottom: 9,
      minHeight: 44,
      alignItems: 'center',
    },
    chip: {
      minHeight: 38,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
      borderRadius: 999,
      paddingHorizontal: 15,
      paddingVertical: 9,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    chipActive: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    modelChipActive: {
      backgroundColor: theme.primaryLight,
      borderColor: theme.primaryLight,
    },
    chipText: {
      color: theme.textSub || theme.textMuted,
      fontSize: 12,
      fontWeight: '900',
    },
    chipTextActive: { color: '#fff' },
    filterInfoCard: {
      marginHorizontal: 16,
      marginBottom: 8,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    filterInfoHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
    },
    activeChipsContent: {
      gap: 8,
      paddingTop: 9,
      paddingRight: 8,
    },
    activeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      maxWidth: 180,
      backgroundColor: (theme.primary || '#EAB308') + '14',
      borderWidth: 1,
      borderColor: (theme.primary || '#EAB308') + '30',
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    activeChipText: {
      color: theme.text,
      fontSize: 11,
      fontWeight: '800',
    },
    filterInfoText: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '600',
    },
    clearFiltersText: {
      color: theme.primaryLight,
      fontSize: 12,
      fontWeight: '900',
    },
    list: { paddingHorizontal: 12, paddingBottom: 110 },
    gridRow: {
      justifyContent: 'space-between',
      columnGap: 10,
    },
    card: {
      flex: 1,
      maxWidth: '48.6%',
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 16,
      padding: 12,
      marginBottom: 10,
    },
    imageBox: {
      height: 105,
      borderRadius: 13,
      backgroundColor: theme.bg2,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      marginBottom: 10,
      position: 'relative',
    },
    image: { width: '100%', height: '100%' },
    stockBadge: {
      position: 'absolute',
      top: 7,
      left: 7,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    lowStockBadge: {
      backgroundColor: theme.warning || '#f59e0b',
    },
    inStockBadge: {
      backgroundColor: (theme.success || '#22c55e') + 'E6',
    },
    stockBadgeText: {
      color: '#111827',
      fontSize: 9,
      fontWeight: '900',
      textTransform: 'uppercase',
    },
    inStockText: {
      color: '#fff',
    },
    partName: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '800',
      minHeight: 36,
    },
    categoryText: {
      color: theme.textMuted,
      fontSize: 11,
      marginTop: 4,
    },
    compatibilityText: {
      color: theme.textSub || theme.textMuted,
      fontSize: 10,
      marginTop: 4,
      fontWeight: '600',
    },
    price: {
      color: theme.primaryLight,
      fontSize: 15,
      fontWeight: '900',
      marginTop: 8,
    },
    stock: {
      color: theme.textSub || theme.textMuted,
      fontSize: 11,
      marginTop: 3,
    },
    detailsButton: {
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.bg2,
      borderRadius: 12,
      paddingVertical: 9,
      alignItems: 'center',
      marginTop: 10,
    },
    detailsButtonText: {
      color: theme.text,
      fontWeight: '900',
      fontSize: 12,
    },
    addButton: {
      backgroundColor: theme.primary,
      borderRadius: 12,
      paddingVertical: 10,
      alignItems: 'center',
      marginTop: 8,
    },
    addButtonAdded: {
      backgroundColor: theme.success || theme.primary,
    },
    addButtonDisabled: {
      backgroundColor: theme.textMuted,
      opacity: 0.7,
    },
    addButtonText: {
      color: '#fff',
      fontWeight: '900',
      fontSize: 12,
    },
    emptyCard: {
      margin: 18,
      padding: 28,
      borderRadius: 18,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
    },
    emptyTitle: {
      color: theme.text,
      fontWeight: '900',
      fontSize: 16,
      marginTop: 10,
    },
    emptyText: {
      color: theme.textSub || theme.textMuted,
      textAlign: 'center',
      marginTop: 4,
    },
    clearButton: {
      marginTop: 14,
      backgroundColor: theme.primary,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    clearButtonText: {
      color: '#fff',
      fontWeight: '900',
      fontSize: 12,
    },
    cartBar: {
      position: 'absolute',
      left: 16,
      right: 16,
      bottom: 18,
      backgroundColor: theme.primary,
      borderRadius: 18,
      padding: 16,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    cartTitle: {
      color: '#fff',
      fontWeight: '900',
      fontSize: 15,
    },
    cartSub: {
      color: '#fff',
      opacity: 0.85,
      fontSize: 12,
      marginTop: 2,
    },
    sortOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'center',
      padding: 22,
    },
    sortSheet: {
      backgroundColor: theme.bg,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 22,
      padding: 16,
    },
    filterSheet: {
      maxHeight: '78%',
      backgroundColor: theme.bg,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 22,
      padding: 16,
    },
    optionList: {
      maxHeight: 420,
    },
    sortSheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 12,
    },
    sortSheetTitle: {
      color: theme.text,
      fontSize: 20,
      fontWeight: '900',
      marginTop: 2,
    },
    sortOption: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 15,
      paddingVertical: 14,
      paddingHorizontal: 14,
      marginBottom: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    sortOptionActive: {
      borderColor: theme.primaryLight || theme.primary,
      backgroundColor: (theme.primary || '#EAB308') + '15',
    },
    sortOptionText: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '800',
    },
    sortOptionTextActive: {
      color: theme.primaryLight || theme.primary,
      fontWeight: '900',
    },
    optionCount: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
      marginTop: 2,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.65)',
      justifyContent: 'flex-end',
    },
    modalCard: {
      maxHeight: '88%',
      backgroundColor: theme.bg,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 18,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      marginBottom: 14,
    },
    modalKicker: {
      color: theme.primaryLight,
      fontSize: 11,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    modalTitle: {
      color: theme.text,
      fontSize: 20,
      fontWeight: '900',
      marginTop: 2,
    },
    closeButton: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalImageBox: {
      height: 210,
      borderRadius: 18,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    modalImage: {
      width: '100%',
      height: '100%',
    },
    modalPrice: {
      color: theme.primaryLight,
      fontSize: 24,
      fontWeight: '900',
      marginBottom: 14,
    },
    modalSectionTitle: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 8,
    },
    modalText: {
      color: theme.textSub || theme.textMuted,
      fontSize: 13,
      lineHeight: 20,
      marginBottom: 14,
    },
    compatibilityWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 14,
    },
    modelBadge: {
      backgroundColor: theme.primary + '15',
      borderWidth: 1,
      borderColor: theme.primary + '33',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
    },
    modelBadgeText: {
      color: theme.primaryLight,
      fontSize: 11,
      fontWeight: '800',
    },
    stockBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 14,
      padding: 12,
      marginBottom: 16,
    },
    stockBoxText: {
      color: theme.textSub || theme.textMuted,
      fontSize: 13,
      fontWeight: '700',
      flex: 1,
    },
    qtySection: {
      marginBottom: 14,
    },
    qtyControl: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    qtyButton: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    qtyButtonText: {
      color: theme.text,
      fontSize: 22,
      fontWeight: '900',
    },
    qtyText: {
      color: theme.text,
      fontSize: 18,
      fontWeight: '900',
      minWidth: 32,
      textAlign: 'center',
    },
    modalAddButton: {
      backgroundColor: theme.primary,
      borderRadius: 16,
      paddingVertical: 15,
      alignItems: 'center',
      marginBottom: 18,
    },
    modalAddButtonText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '900',
    },
    modalCheckoutButton: {
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
      borderRadius: 16,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
      marginBottom: 18,
    },
    modalCheckoutText: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '900',
    },
    messageOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.62)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    messageCard: {
      width: '100%',
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 20,
      padding: 22,
      alignItems: 'center',
    },
    messageIcon: {
      width: 62,
      height: 62,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    messageIconSuccess: {
      backgroundColor: (theme.success || '#22c55e') + '18',
    },
    messageIconError: {
      backgroundColor: (theme.danger || '#ef4444') + '18',
    },
    messageTitle: {
      color: theme.text,
      fontSize: 18,
      fontWeight: '900',
      textAlign: 'center',
    },
    messageText: {
      color: theme.textSub || theme.textMuted,
      fontSize: 13,
      lineHeight: 20,
      textAlign: 'center',
      marginTop: 6,
    },
    messageButton: {
      width: '100%',
      borderRadius: 14,
      paddingVertical: 13,
      alignItems: 'center',
      marginTop: 18,
    },
    messageButtonSuccess: {
      backgroundColor: theme.success || '#22c55e',
    },
    messageButtonError: {
      backgroundColor: theme.danger || '#ef4444',
    },
    messageButtonText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '900',
    },
  });
