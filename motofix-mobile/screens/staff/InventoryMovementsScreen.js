import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';

const YELLOW = '#EAB308';

const MOVEMENT_TYPES = [
  { key: 'all', label: 'All', icon: 'layers-outline' },
  { key: 'stock_in', label: 'Stock In', icon: 'add-circle-outline' },
  { key: 'stock_out', label: 'Stock Out', icon: 'remove-circle-outline' },
  { key: 'reserved', label: 'Reserved', icon: 'lock-closed-outline' },
  { key: 'released', label: 'Released', icon: 'return-up-back-outline' },
  { key: 'used_service', label: 'Used Service', icon: 'construct-outline' },
  { key: 'sold_order', label: 'Sold Order', icon: 'cart-outline' },
  { key: 'refund_return', label: 'Refund Return', icon: 'arrow-undo-outline' },
  { key: 'manual_adjustment', label: 'Manual', icon: 'options-outline' },
];

const DATE_FILTERS = [
  { key: 'all', label: 'All Time' },
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Last 7 Days' },
  { key: '30d', label: 'Last 30 Days' },
];

const SORT_OPTIONS = [
  { key: 'newest', label: 'Newest' },
  { key: 'oldest', label: 'Oldest' },
  { key: 'qty_high', label: 'Qty High' },
  { key: 'qty_low', label: 'Qty Low' },
];

const POSITIVE_TYPES = ['stock_in', 'released', 'refund_return'];
const NEGATIVE_TYPES = [
  'stock_out',
  'reserved',
  'used_service',
  'sold_order',
  'manual_adjustment',
];

function humanize(value) {
  if (!value) return 'Unknown';

  return String(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDateTime(value) {
  if (!value) return '—';

  return new Date(value).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatShortDate(value) {
  if (!value) return '—';

  return new Date(value).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getMovementMeta(type) {
  return (
    MOVEMENT_TYPES.find((item) => item.key === type) || {
      key: type || 'unknown',
      label: humanize(type || 'Unknown'),
      icon: 'swap-horizontal-outline',
    }
  );
}

function getDateThreshold(filter) {
  const now = new Date();

  if (filter === 'today') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  if (filter === '7d') {
    const date = new Date(now);
    date.setDate(date.getDate() - 7);
    return date;
  }

  if (filter === '30d') {
    const date = new Date(now);
    date.setDate(date.getDate() - 30);
    return date;
  }

  return null;
}

function getSignedQuantity(movement) {
  const quantity = Number(movement?.quantity) || 0;

  if (POSITIVE_TYPES.includes(movement?.movement_type)) return quantity;
  if (NEGATIVE_TYPES.includes(movement?.movement_type)) return -quantity;

  const previousStock = Number(movement?.previous_stock);
  const newStock = Number(movement?.new_stock);

  if (Number.isFinite(previousStock) && Number.isFinite(newStock)) {
    return newStock - previousStock;
  }

  return quantity;
}

function getUserName(profile) {
  const name = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim();

  return name || profile?.email || 'System';
}

function getMovementTone(theme, movement) {
  const signed = getSignedQuantity(movement);

  if (signed > 0) {
    return {
      color: theme.success || '#22c55e',
      bg: (theme.success || '#22c55e') + '18',
      icon: 'trending-up',
      label: 'Increase',
    };
  }

  if (signed < 0) {
    return {
      color: theme.danger || '#ef4444',
      bg: (theme.danger || '#ef4444') + '18',
      icon: 'trending-down',
      label: 'Decrease',
    };
  }

  return {
    color: theme.textMuted || '#9ca3af',
    bg: theme.bg2,
    icon: 'remove',
    label: 'No Change',
  };
}

function getReferenceText(movement) {
  if (movement?.related_order_id) {
    return `Order #${String(movement.related_order_id).slice(0, 8).toUpperCase()}`;
  }

  if (movement?.related_booking_id) {
    return `Booking #${String(movement.related_booking_id).slice(0, 8).toUpperCase()}`;
  }

  return 'Manual / System';
}

export default function InventoryMovementsScreen({ navigation }) {
  const { theme } = useTheme();
  const s = styles(theme);

  const [movements, setMovements] = useState([]);
  const [viewerRole, setViewerRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');

  useEffect(() => {
    navigation?.setOptions?.({
      title: 'Inventory History',
      headerBackTitle: 'Inventory',
    });
  }, [navigation]);

  const fetchViewerRole = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      setViewerRole(null);
      return null;
    }

    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    const role = data?.role || null;
    setViewerRole(role);

    return role;
  }, []);

  const fetchMovements = useCallback(
    async (showMainLoader = true) => {
      if (showMainLoader) setLoading(true);
      setFetchError('');

      const role = await fetchViewerRole();

      if (!role || !['admin', 'staff'].includes(role)) {
        setMovements([]);
        setFetchError('Only admin or staff accounts can view inventory movement history.');
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const { data, error } = await supabase
        .from('inventory_movements')
        .select(
          `
          id,
          part_id,
          movement_type,
          quantity,
          previous_stock,
          new_stock,
          reason,
          related_order_id,
          related_booking_id,
          performed_by,
          created_at,
          parts!inventory_movements_part_id_fkey (
            id,
            name,
            category,
            image_url
          ),
          profiles!inventory_movements_performed_by_fkey (
            id,
            first_name,
            last_name,
            email,
            role
          ),
          orders!inventory_movements_related_order_id_fkey (
            id,
            created_at,
            status
          ),
          bookings!inventory_movements_related_booking_id_fkey (
            id,
            booking_date,
            booking_time,
            status
          )
        `
        )
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) {
        console.log('Inventory movements error:', error.message);
        setFetchError(error.message || 'Failed to load inventory movement history.');
        setMovements([]);
      } else {
        setMovements(data || []);
        setLastUpdated(new Date());
      }

      setLoading(false);
      setRefreshing(false);
    },
    [fetchViewerRole]
  );

  useEffect(() => {
    fetchMovements(true);

    const channel = supabase
      .channel('mobile-inventory-movements')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'inventory_movements',
        },
        () => fetchMovements(false)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchMovements]);

  useFocusEffect(
    useCallback(() => {
      fetchMovements(false);
    }, [fetchMovements])
  );

  function onRefresh() {
    setRefreshing(true);
    fetchMovements(false);
  }

  const filteredMovements = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();
    const threshold = getDateThreshold(dateFilter);

    let result = movements.filter((movement) => {
      const part = movement.parts;
      const profile = movement.profiles;
      const createdAt = movement.created_at ? new Date(movement.created_at) : null;

      const searchText = [
        part?.name,
        part?.category,
        movement.movement_type,
        movement.reason,
        profile?.first_name,
        profile?.last_name,
        profile?.email,
        profile?.role,
        movement.related_order_id,
        movement.related_booking_id,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const matchesSearch = !searchTerm || searchText.includes(searchTerm);
      const matchesType = typeFilter === 'all' || movement.movement_type === typeFilter;
      const matchesDate = !threshold || (createdAt && createdAt >= threshold);

      return matchesSearch && matchesType && matchesDate;
    });

    result = [...result].sort((a, b) => {
      if (sortBy === 'oldest') {
        return new Date(a.created_at || 0) - new Date(b.created_at || 0);
      }

      if (sortBy === 'qty_high') {
        return Math.abs(getSignedQuantity(b)) - Math.abs(getSignedQuantity(a));
      }

      if (sortBy === 'qty_low') {
        return Math.abs(getSignedQuantity(a)) - Math.abs(getSignedQuantity(b));
      }

      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });

    return result;
  }, [dateFilter, movements, search, sortBy, typeFilter]);

  const stats = useMemo(() => {
    const stockIn = filteredMovements
      .filter((movement) => getSignedQuantity(movement) > 0)
      .reduce((sum, movement) => sum + getSignedQuantity(movement), 0);

    const stockOut = filteredMovements
      .filter((movement) => getSignedQuantity(movement) < 0)
      .reduce((sum, movement) => sum + Math.abs(getSignedQuantity(movement)), 0);

    const sold = filteredMovements
      .filter((movement) => movement.movement_type === 'sold_order')
      .reduce((sum, movement) => sum + (Number(movement.quantity) || 0), 0);

    const serviceUsed = filteredMovements
      .filter((movement) => movement.movement_type === 'used_service')
      .reduce((sum, movement) => sum + (Number(movement.quantity) || 0), 0);

    return {
      total: filteredMovements.length,
      stockIn,
      stockOut,
      netChange: stockIn - stockOut,
      sold,
      serviceUsed,
    };
  }, [filteredMovements]);

  const hasFilters =
    search.trim() ||
    typeFilter !== 'all' ||
    dateFilter !== 'all' ||
    sortBy !== 'newest';

  function clearFilters() {
    setSearch('');
    setTypeFilter('all');
    setDateFilter('all');
    setSortBy('newest');
  }

  async function shareSummary() {
    const message = [
      'MotoFix Inventory Movement Summary',
      `Date filter: ${DATE_FILTERS.find((item) => item.key === dateFilter)?.label || 'All Time'}`,
      `Type filter: ${MOVEMENT_TYPES.find((item) => item.key === typeFilter)?.label || 'All'}`,
      `Movements: ${stats.total}`,
      `Stock In: +${stats.stockIn}`,
      `Stock Out: -${stats.stockOut}`,
      `Net Change: ${stats.netChange >= 0 ? '+' : ''}${stats.netChange}`,
      `Sold via Orders: ${stats.sold}`,
      `Used in Service: ${stats.serviceUsed}`,
      lastUpdated ? `Last updated: ${formatDateTime(lastUpdated)}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      await Share.share({ message });
    } catch (error) {
      console.log('Share failed:', error.message);
    }
  }

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={theme.primaryLight || YELLOW} />
        <Text style={s.loadingText}>Loading inventory history...</Text>
      </View>
    );
  }

  if (fetchError && movements.length === 0) {
    return (
      <View style={s.centered}>
        <Ionicons name="warning" size={42} color={theme.danger || '#ef4444'} />
        <Text style={s.emptyTitle}>Cannot load inventory history</Text>
        <Text style={s.emptyText}>{fetchError}</Text>

        <TouchableOpacity style={s.primaryBtn} onPress={() => fetchMovements(true)}>
          <Ionicons name="refresh" size={17} color="#fff" />
          <Text style={s.primaryBtnText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.primaryLight || YELLOW}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={s.headerCard}>
          <View style={s.headerTop}>
            <View style={{ flex: 1 }}>
              <Text style={s.kicker}>Inventory Control</Text>
              <Text style={s.title}>Inventory History</Text>
              <Text style={s.subtitle}>
                Track stock in, stock out, sales, service usage, returns, and manual changes.
              </Text>
              {lastUpdated && (
                <Text style={s.lastUpdated}>Last updated {formatDateTime(lastUpdated)}</Text>
              )}
            </View>

            <TouchableOpacity style={s.shareBtn} onPress={shareSummary}>
              <Ionicons name="share-social-outline" size={18} color={theme.text} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.statsRow}
        >
          <StatCard theme={theme} label="Movements" value={stats.total} icon="analytics" />
          <StatCard
            theme={theme}
            label="Stock In"
            value={`+${stats.stockIn}`}
            icon="trending-up"
            color={theme.success || '#22c55e'}
          />
          <StatCard
            theme={theme}
            label="Stock Out"
            value={`-${stats.stockOut}`}
            icon="trending-down"
            color={theme.danger || '#ef4444'}
          />
          <StatCard
            theme={theme}
            label="Net Change"
            value={`${stats.netChange >= 0 ? '+' : ''}${stats.netChange}`}
            icon="swap-horizontal"
            color={stats.netChange >= 0 ? theme.success || '#22c55e' : theme.danger || '#ef4444'}
          />
          <StatCard theme={theme} label="Sold" value={stats.sold} icon="cart" />
          <StatCard theme={theme} label="Service Used" value={stats.serviceUsed} icon="construct" />
        </ScrollView>

        <View style={s.searchWrap}>
          <Ionicons name="search" size={17} color={theme.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search part, user, reason, order, booking..."
            placeholderTextColor={theme.textMuted}
            style={s.searchInput}
          />
          {!!search && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={theme.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <Text style={s.filterLabel}>Movement Type</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chipRow}
        >
          {MOVEMENT_TYPES.map((item) => {
            const active = typeFilter === item.key;

            return (
              <TouchableOpacity
                key={item.key}
                style={[s.chip, active && s.chipActive]}
                onPress={() => setTypeFilter(item.key)}
              >
                <Ionicons
                  name={item.icon}
                  size={14}
                  color={active ? '#fff' : theme.textMuted}
                />
                <Text style={[s.chipText, active && s.chipTextActive]}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text style={s.filterLabel}>Date</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chipRow}
        >
          {DATE_FILTERS.map((item) => {
            const active = dateFilter === item.key;

            return (
              <TouchableOpacity
                key={item.key}
                style={[s.chip, active && s.chipActive]}
                onPress={() => setDateFilter(item.key)}
              >
                <Text style={[s.chipText, active && s.chipTextActive]}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text style={s.filterLabel}>Sort</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chipRow}
        >
          {SORT_OPTIONS.map((item) => {
            const active = sortBy === item.key;

            return (
              <TouchableOpacity
                key={item.key}
                style={[s.chip, active && s.chipActive]}
                onPress={() => setSortBy(item.key)}
              >
                <Text style={[s.chipText, active && s.chipTextActive]}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={s.resultsRow}>
          <Text style={s.resultsText}>
            {filteredMovements.length} of {movements.length} movement
            {movements.length === 1 ? '' : 's'} shown
          </Text>

          {hasFilters && (
            <TouchableOpacity onPress={clearFilters}>
              <Text style={s.clearText}>Clear filters</Text>
            </TouchableOpacity>
          )}
        </View>

        {fetchError ? (
          <View style={s.inlineError}>
            <Ionicons name="warning-outline" size={17} color={theme.danger || '#ef4444'} />
            <Text style={s.inlineErrorText}>{fetchError}</Text>
          </View>
        ) : null}

        {filteredMovements.length === 0 ? (
          <View style={s.emptyCard}>
            <Ionicons name="file-tray-outline" size={38} color={theme.textMuted} />
            <Text style={s.emptyTitle}>No movements found</Text>
            <Text style={s.emptyText}>
              {movements.length === 0
                ? 'Stock movement history will appear here once inventory changes are recorded.'
                : 'Try changing your filters or search term.'}
            </Text>
          </View>
        ) : (
          filteredMovements.map((movement) => {
            const meta = getMovementMeta(movement.movement_type);
            const tone = getMovementTone(theme, movement);
            const signedQty = getSignedQuantity(movement);
            const quantityText =
              signedQty > 0 ? `+${signedQty}` : signedQty < 0 ? `${signedQty}` : '0';

            return (
              <View key={movement.id} style={s.movementCard}>
                <View style={s.movementTop}>
                  <View style={[s.movementIcon, { backgroundColor: tone.bg }]}>
                    <Ionicons name={meta.icon || tone.icon} size={20} color={tone.color} />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={s.partName}>{movement.parts?.name || 'Unknown Part'}</Text>
                    <Text style={s.partSub}>
                      {movement.parts?.category || 'Uncategorized'} · {formatDateTime(movement.created_at)}
                    </Text>
                  </View>

                  <View style={s.qtyBox}>
                    <Text style={[s.qtyText, { color: tone.color }]}>{quantityText}</Text>
                    <Text style={s.qtyLabel}>qty</Text>
                  </View>
                </View>

                <View style={s.badgeRow}>
                  <View style={[s.typeBadge, { backgroundColor: tone.bg }]}>
                    <Text style={[s.typeBadgeText, { color: tone.color }]}>{meta.label}</Text>
                  </View>

                  <View style={s.referenceBadge}>
                    <Text style={s.referenceText}>{getReferenceText(movement)}</Text>
                  </View>
                </View>

                <View style={s.stockBox}>
                  <InfoMini
                    theme={theme}
                    label="Previous"
                    value={movement.previous_stock ?? '—'}
                  />
                  <Ionicons name="arrow-forward" size={16} color={theme.textMuted} />
                  <InfoMini theme={theme} label="New Stock" value={movement.new_stock ?? '—'} />
                  <InfoMini
                    theme={theme}
                    label="Date"
                    value={formatShortDate(movement.created_at)}
                  />
                </View>

                {!!movement.reason && (
                  <View style={s.reasonBox}>
                    <Text style={s.reasonLabel}>Reason</Text>
                    <Text style={s.reasonText}>{movement.reason}</Text>
                  </View>
                )}

                <View style={s.footerRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.footerLabel}>Performed by</Text>
                    <Text style={s.footerValue}>
                      {getUserName(movement.profiles)}
                      {movement.profiles?.role ? ` · ${humanize(movement.profiles.role)}` : ''}
                    </Text>
                  </View>

                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={s.footerLabel}>Movement ID</Text>
                    <Text style={s.footerValue}>#{String(movement.id).slice(0, 8).toUpperCase()}</Text>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

function StatCard({ theme, label, value, icon, color }) {
  const s = styles(theme);
  const resolvedColor = color || theme.primaryLight || YELLOW;

  return (
    <View style={s.statCard}>
      <View style={[s.statIcon, { backgroundColor: resolvedColor + '18' }]}>
        <Ionicons name={icon} size={18} color={resolvedColor} />
      </View>
      <Text style={[s.statValue, { color: resolvedColor }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function InfoMini({ theme, label, value }) {
  const s = styles(theme);

  return (
    <View style={s.infoMini}>
      <Text style={s.infoMiniLabel}>{label}</Text>
      <Text style={s.infoMiniValue}>{value}</Text>
    </View>
  );
}

const styles = (theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.bg,
    },
    centered: {
      flex: 1,
      backgroundColor: theme.bg,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 28,
    },
    loadingText: {
      color: theme.textMuted,
      fontWeight: '700',
      marginTop: 10,
    },
    content: {
      padding: 16,
      paddingBottom: 42,
    },
    headerCard: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 18,
      padding: 16,
      marginBottom: 14,
    },
    headerTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    kicker: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '900',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      marginBottom: 4,
    },
    title: {
      color: theme.text,
      fontSize: 22,
      fontWeight: '900',
    },
    subtitle: {
      color: theme.textSub || theme.textMuted,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 4,
    },
    lastUpdated: {
      color: theme.textMuted,
      fontSize: 11,
      marginTop: 8,
      fontWeight: '600',
    },
    shareBtn: {
      width: 42,
      height: 42,
      borderRadius: 14,
      backgroundColor: theme.bg2,
      borderWidth: 1,
      borderColor: theme.border,
      justifyContent: 'center',
      alignItems: 'center',
    },
    statsRow: {
      gap: 10,
      paddingBottom: 14,
    },
    statCard: {
      width: 128,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 16,
      padding: 13,
    },
    statIcon: {
      width: 32,
      height: 32,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 8,
    },
    statValue: {
      fontSize: 20,
      fontWeight: '900',
    },
    statLabel: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '800',
      marginTop: 2,
    },
    searchWrap: {
      height: 46,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 14,
      paddingHorizontal: 13,
      marginBottom: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
    },
    searchInput: {
      flex: 1,
      height: '100%',
      color: theme.text,
      fontSize: 13,
      fontWeight: '600',
    },
    filterLabel: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 7,
      marginTop: 2,
    },
    chipRow: {
      gap: 8,
      paddingBottom: 11,
    },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    chipActive: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    chipText: {
      color: theme.textSub || theme.textMuted,
      fontSize: 12,
      fontWeight: '800',
    },
    chipTextActive: {
      color: '#fff',
      fontWeight: '900',
    },
    resultsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
    },
    resultsText: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '700',
    },
    clearText: {
      color: theme.primaryLight || YELLOW,
      fontSize: 12,
      fontWeight: '900',
    },
    inlineError: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: (theme.danger || '#ef4444') + '14',
      borderWidth: 1,
      borderColor: (theme.danger || '#ef4444') + '44',
      borderRadius: 14,
      padding: 12,
      marginBottom: 12,
    },
    inlineErrorText: {
      flex: 1,
      color: theme.danger || '#ef4444',
      fontSize: 12,
      fontWeight: '700',
    },
    emptyCard: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 16,
      padding: 28,
      alignItems: 'center',
    },
    emptyTitle: {
      color: theme.text,
      fontSize: 17,
      fontWeight: '900',
      marginTop: 12,
    },
    emptyText: {
      color: theme.textSub || theme.textMuted,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 5,
      textAlign: 'center',
    },
    primaryBtn: {
      marginTop: 16,
      borderRadius: 12,
      paddingVertical: 13,
      paddingHorizontal: 16,
      backgroundColor: theme.primary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    primaryBtnText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '900',
    },
    movementCard: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 16,
      padding: 14,
      marginBottom: 12,
    },
    movementTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
    },
    movementIcon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      justifyContent: 'center',
      alignItems: 'center',
    },
    partName: {
      color: theme.text,
      fontSize: 15,
      fontWeight: '900',
    },
    partSub: {
      color: theme.textMuted,
      fontSize: 11,
      marginTop: 2,
      lineHeight: 16,
    },
    qtyBox: {
      alignItems: 'flex-end',
      minWidth: 54,
    },
    qtyText: {
      fontSize: 22,
      fontWeight: '900',
    },
    qtyLabel: {
      color: theme.textMuted,
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
    },
    badgeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 12,
    },
    typeBadge: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    typeBadgeText: {
      fontSize: 11,
      fontWeight: '900',
    },
    referenceBadge: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
      backgroundColor: theme.bg2,
      borderWidth: 1,
      borderColor: theme.border,
    },
    referenceText: {
      color: theme.textSub || theme.textMuted,
      fontSize: 11,
      fontWeight: '800',
    },
    stockBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: theme.bg2,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 14,
      padding: 11,
      marginTop: 12,
    },
    infoMini: {
      flex: 1,
    },
    infoMiniLabel: {
      color: theme.textMuted,
      fontSize: 10,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginBottom: 3,
    },
    infoMiniValue: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '900',
    },
    reasonBox: {
      backgroundColor: theme.bg2,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 13,
      padding: 11,
      marginTop: 11,
    },
    reasonLabel: {
      color: theme.textMuted,
      fontSize: 10,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginBottom: 4,
    },
    reasonText: {
      color: theme.textSub || theme.text,
      fontSize: 12,
      lineHeight: 18,
      fontStyle: 'italic',
    },
    footerRow: {
      flexDirection: 'row',
      gap: 12,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      marginTop: 12,
      paddingTop: 11,
    },
    footerLabel: {
      color: theme.textMuted,
      fontSize: 10,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginBottom: 3,
    },
    footerValue: {
      color: theme.text,
      fontSize: 12,
      fontWeight: '800',
    },
  });
