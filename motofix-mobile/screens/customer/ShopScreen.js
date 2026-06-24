import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
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

export default function ShopScreen({ navigation }) {
  const { theme } = useTheme();
  const { cart, cartTotalItems, addToCart } = useCart();

  const [parts, setParts] = useState([]);
  const [models, setModels] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [selectedModel, setSelectedModel] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const s = styles(theme);

  useEffect(() => {
    fetchShop();
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
      .order('make', { ascending: true });

    if (partsError) {
      Alert.alert('Shop Error', partsError.message);
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
    const fromParts = parts.flatMap((part) =>
      Array.isArray(part.compatible_models) ? part.compatible_models : []
    );

    return ['all', ...new Set([...fromModels, ...fromParts].filter(Boolean).sort())];
  }, [models, parts]);

  const filteredParts = useMemo(() => {
    const query = normalize(search);

    return parts.filter((part) => {
      const compatibleModels = Array.isArray(part.compatible_models)
        ? part.compatible_models
        : [];

      const searchable = [
        part.name,
        part.category,
        part.description,
        ...compatibleModels,
      ]
        .filter(Boolean)
        .join(' ');

      const matchSearch = !query || normalize(searchable).includes(query);
      const matchCategory = category === 'all' || (part.category || 'General') === category;
      const matchModel =
        selectedModel === 'all' ||
        compatibleModels.some((model) => normalize(model) === normalize(selectedModel));

      return matchSearch && matchCategory && matchModel;
    });
  }, [parts, search, category, selectedModel]);

  function cartQty(partId) {
    return cart.find((item) => item.id === partId)?.quantity || 0;
  }

  function handleAdd(part) {
    const alreadyInCart = cartQty(part.id);
    const stock = Number(part.stock_quantity) || 0;

    if (alreadyInCart >= stock) {
      Alert.alert('Stock limit', `You already added all available stock for ${part.name}.`);
      return;
    }

    addToCart(part, 1);
  }

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={theme.primaryLight} />
        <Text style={s.loadingText}>Loading shop...</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View>
          <Text style={s.kicker}>MotoFix Parts Shop</Text>
          <Text style={s.title}>Shop</Text>
          <Text style={s.subtitle}>Browse motorcycle parts and checkout your order.</Text>
        </View>

        <TouchableOpacity
          style={s.historyButton}
          onPress={() => navigation.navigate('OrderHistory')}
        >
          <Ionicons name="receipt-outline" size={20} color={theme.text} />
        </TouchableOpacity>
      </View>

      <View style={s.searchRow}>
        <Ionicons name="search" size={18} color={theme.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search parts..."
          placeholderTextColor={theme.textMuted}
          style={s.searchInput}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.chips}
      >
        {categories.map((item) => (
          <TouchableOpacity
            key={item}
            style={[s.chip, category === item && s.chipActive]}
            onPress={() => setCategory(item)}
          >
            <Text style={[s.chipText, category === item && s.chipTextActive]}>
              {item === 'all' ? 'All Categories' : item}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.chips}
      >
        {modelOptions.map((item) => (
          <TouchableOpacity
            key={item}
            style={[s.chip, selectedModel === item && s.modelChipActive]}
            onPress={() => setSelectedModel(item)}
          >
            <Text style={[s.chipText, selectedModel === item && s.chipTextActive]}>
              {item === 'all' ? 'All Models' : item}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={filteredParts}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={s.gridRow}
        contentContainerStyle={s.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primaryLight} />
        }
        ListEmptyComponent={
          <View style={s.emptyCard}>
            <Ionicons name="cube-outline" size={38} color={theme.textMuted} />
            <Text style={s.emptyTitle}>No parts found</Text>
            <Text style={s.emptyText}>Try another search, category, or model filter.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const inCart = cartQty(item.id);
          const stock = Number(item.stock_quantity) || 0;

          return (
            <View style={s.card}>
              <View style={s.imageBox}>
                {item.image_url ? (
                  <Image source={{ uri: item.image_url }} style={s.image} resizeMode="cover" />
                ) : (
                  <Ionicons name="image-outline" size={30} color={theme.textMuted} />
                )}
              </View>

              <Text style={s.partName} numberOfLines={2}>
                {item.name}
              </Text>

              <Text style={s.categoryText}>{item.category || 'General'}</Text>

              <Text style={s.price}>{formatPeso(item.price)}</Text>

              <Text style={s.stock}>
                {inCart > 0 ? `${inCart} in cart · ${stock} stock` : `${stock} stock`}
              </Text>

              <TouchableOpacity
                style={[s.addButton, inCart > 0 && s.addButtonAdded]}
                onPress={() => handleAdd(item)}
              >
                <Text style={s.addButtonText}>
                  {inCart > 0 ? 'Add More' : 'Add to Cart'}
                </Text>
              </TouchableOpacity>
            </View>
          );
        }}
      />

      {cartTotalItems > 0 && (
        <TouchableOpacity style={s.cartBar} onPress={() => navigation.navigate('Checkout')}>
          <View>
            <Text style={s.cartTitle}>{cartTotalItems} item(s) in cart</Text>
            <Text style={s.cartSub}>Review and checkout</Text>
          </View>
          <Ionicons name="arrow-forward" size={22} color="#fff" />
        </TouchableOpacity>
      )}
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
    loadingText: { color: theme.textSub, marginTop: 10 },
    header: {
      paddingHorizontal: 18,
      paddingTop: 20,
      paddingBottom: 12,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    kicker: {
      color: theme.primaryLight,
      fontSize: 11,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    title: { color: theme.text, fontSize: 28, fontWeight: '900', marginTop: 3 },
    subtitle: { color: theme.textSub, fontSize: 13, marginTop: 3, maxWidth: 260 },
    historyButton: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
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
    searchInput: { flex: 1, paddingVertical: 12, marginLeft: 8, color: theme.text },
    chips: { paddingHorizontal: 16, gap: 8, paddingBottom: 8 },
    chip: {
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
      borderRadius: 999,
      paddingHorizontal: 13,
      paddingVertical: 8,
      marginRight: 8,
    },
    chipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
    modelChipActive: { backgroundColor: theme.primaryLight, borderColor: theme.primaryLight },
    chipText: { color: theme.textSub, fontSize: 12, fontWeight: '700' },
    chipTextActive: { color: '#fff' },
    list: { paddingHorizontal: 12, paddingBottom: 110 },
    gridRow: { gap: 10 },
    card: {
      flex: 1,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 16,
      padding: 12,
      margin: 5,
    },
    imageBox: {
      height: 105,
      borderRadius: 13,
      backgroundColor: theme.bg2,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      marginBottom: 10,
    },
    image: { width: '100%', height: '100%' },
    partName: { color: theme.text, fontSize: 14, fontWeight: '800', minHeight: 36 },
    categoryText: { color: theme.textMuted, fontSize: 11, marginTop: 4 },
    price: { color: theme.primaryLight, fontSize: 15, fontWeight: '900', marginTop: 8 },
    stock: { color: theme.textSub, fontSize: 11, marginTop: 3 },
    addButton: {
      backgroundColor: theme.primary,
      borderRadius: 12,
      paddingVertical: 10,
      alignItems: 'center',
      marginTop: 12,
    },
    addButtonAdded: { backgroundColor: theme.success || theme.primary },
    addButtonText: { color: '#fff', fontWeight: '900', fontSize: 12 },
    emptyCard: {
      margin: 18,
      padding: 28,
      borderRadius: 18,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
    },
    emptyTitle: { color: theme.text, fontWeight: '900', fontSize: 16, marginTop: 10 },
    emptyText: { color: theme.textSub, textAlign: 'center', marginTop: 4 },
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
    cartTitle: { color: '#fff', fontWeight: '900', fontSize: 15 },
    cartSub: { color: '#fff', opacity: 0.85, fontSize: 12, marginTop: 2 },
  });