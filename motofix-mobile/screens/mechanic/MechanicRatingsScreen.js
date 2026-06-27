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

const RATING_FILTERS = [
  { key: 'all', label: 'All' },
  { key: '5', label: '5 ★' },
  { key: '4', label: '4 ★' },
  { key: '3', label: '3 ★' },
  { key: '2', label: '2 ★' },
  { key: '1', label: '1 ★' },
];

const SORT_OPTIONS = [
  { key: 'newest', label: 'Newest' },
  { key: 'oldest', label: 'Oldest' },
  { key: 'highest', label: 'Highest' },
  { key: 'lowest', label: 'Lowest' },
];

function humanize(value) {
  if (!value) return '—';

  return String(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value) {
  if (!value) return '—';

  return new Date(value).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(value) {
  if (!value) return '—';

  return new Date(value).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getName(profile) {
  const name = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim();
  return name || 'Customer';
}

function buildDistribution(reviews) {
  const result = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };

  (reviews || []).forEach((review) => {
    const rating = Number(review.rating);
    if (result[rating] !== undefined) {
      result[rating] += 1;
    }
  });

  return result;
}

function averageRating(reviews) {
  if (!reviews?.length) return 0;

  const sum = reviews.reduce((total, review) => total + (Number(review.rating) || 0), 0);
  return sum / reviews.length;
}

function StarRating({ theme, rating = 0, size = 17, showNumber = false }) {
  const value = Number(rating) || 0;
  const rounded = Math.round(value);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Ionicons
          key={star}
          name={star <= rounded ? 'star' : 'star-outline'}
          size={size}
          color={star <= rounded ? YELLOW : theme.textMuted}
        />
      ))}

      {showNumber && (
        <Text
          style={{
            color: theme.text,
            fontSize: Math.max(12, size - 2),
            fontWeight: '900',
            marginLeft: 5,
          }}
        >
          {value ? value.toFixed(1) : '—'}
        </Text>
      )}
    </View>
  );
}

export default function MechanicRatingsScreen({ navigation }) {
  const { theme } = useTheme();
  const s = styles(theme);

  const [mechanicId, setMechanicId] = useState(null);
  const [profile, setProfile] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState('');

  const [search, setSearch] = useState('');
  const [ratingFilter, setRatingFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');

  useEffect(() => {
    navigation?.setOptions?.({
      title: 'My Ratings',
      headerBackTitle: 'Back',
    });
  }, [navigation]);

  const fetchProfile = useCallback(async (userId) => {
    let { data, error } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email, role, specialization, rating_avg, rating_count')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.log('Rating summary columns unavailable, retrying safe profile query:', error.message);

      const fallback = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, role, specialization')
        .eq('id', userId)
        .maybeSingle();

      data = fallback.data;
      error = fallback.error;
    }

    if (!error) {
      setProfile(data || null);
    }

    return data || null;
  }, []);

  const fetchReviews = useCallback(async (userId) => {
    if (!userId) {
      setReviews([]);
      return;
    }

    let { data, error } = await supabase
      .from('mechanic_ratings')
      .select(
        `
        id,
        rating,
        comment,
        created_at,
        customer_id,
        booking_id,
        profiles!mechanic_ratings_customer_id_fkey (
          first_name,
          last_name
        ),
        bookings!mechanic_ratings_booking_id_fkey (
          id,
          booking_date,
          booking_time,
          status,
          services (
            name
          )
        )
      `
      )
      .eq('mechanic_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.log('Nested rating query failed, retrying safe query:', error.message);

      const fallback = await supabase
        .from('mechanic_ratings')
        .select('id, rating, comment, created_at, customer_id, booking_id')
        .eq('mechanic_id', userId)
        .order('created_at', { ascending: false });

      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      setFetchError(error.message || 'Failed to load mechanic ratings.');
      setReviews([]);
    } else {
      setReviews(data || []);
    }
  }, []);

  const fetchData = useCallback(
    async (showMainLoader = true) => {
      if (showMainLoader) setLoading(true);
      setFetchError('');

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id) {
        setMechanicId(null);
        setProfile(null);
        setReviews([]);
        setFetchError('Please log in again to view your ratings.');
        setLoading(false);
        setRefreshing(false);
        return;
      }

      setMechanicId(user.id);

      const currentProfile = await fetchProfile(user.id);

      if (currentProfile?.role && currentProfile.role !== 'mechanic') {
        setFetchError('Only mechanic accounts can view this page.');
        setReviews([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      await fetchReviews(user.id);

      setLoading(false);
      setRefreshing(false);
    },
    [fetchProfile, fetchReviews]
  );

  useEffect(() => {
    fetchData(true);
  }, [fetchData]);

  useFocusEffect(
    useCallback(() => {
      fetchData(false);
    }, [fetchData])
  );

  useEffect(() => {
    if (!mechanicId) return;

    const channel = supabase
      .channel(`mobile-mechanic-ratings-${mechanicId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'mechanic_ratings',
          filter: `mechanic_id=eq.${mechanicId}`,
        },
        () => fetchData(false)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData, mechanicId]);

  function onRefresh() {
    setRefreshing(true);
    fetchData(false);
  }

  const filteredReviews = useMemo(() => {
    const query = search.trim().toLowerCase();

    let result = reviews.filter((review) => {
      const serviceName = review.bookings?.services?.name || '';
      const customerName = getName(review.profiles);
      const comment = review.comment || '';

      const haystack = [serviceName, customerName, comment, review.booking_id]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const matchesSearch = !query || haystack.includes(query);
      const matchesRating =
        ratingFilter === 'all' || Number(review.rating) === Number(ratingFilter);

      return matchesSearch && matchesRating;
    });

    result = [...result].sort((a, b) => {
      if (sortBy === 'oldest') {
        return new Date(a.created_at || 0) - new Date(b.created_at || 0);
      }

      if (sortBy === 'highest') {
        return (Number(b.rating) || 0) - (Number(a.rating) || 0);
      }

      if (sortBy === 'lowest') {
        return (Number(a.rating) || 0) - (Number(b.rating) || 0);
      }

      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });

    return result;
  }, [ratingFilter, reviews, search, sortBy]);

  const distribution = useMemo(() => buildDistribution(reviews), [reviews]);
  const calculatedAverage = useMemo(() => averageRating(reviews), [reviews]);
  const profileAverage = Number(profile?.rating_avg) || 0;
  const profileCount = Number(profile?.rating_count) || 0;
  const ratingAverage = profileAverage || calculatedAverage;
  const ratingCount = profileCount || reviews.length;
  const positiveReviews = reviews.filter((review) => Number(review.rating) >= 4).length;
  const lowReviews = reviews.filter((review) => Number(review.rating) <= 2).length;

  const hasFilters = search.trim() || ratingFilter !== 'all' || sortBy !== 'newest';

  async function shareSummary() {
    const message = [
      'MotoFix Mechanic Rating Summary',
      `Mechanic: ${getName(profile)}`,
      profile?.specialization ? `Specialization: ${profile.specialization}` : '',
      `Average Rating: ${ratingAverage ? ratingAverage.toFixed(1) : '—'}/5`,
      `Total Reviews: ${ratingCount}`,
      `5 Stars: ${distribution[5]}`,
      `4 Stars: ${distribution[4]}`,
      `3 Stars: ${distribution[3]}`,
      `2 Stars: ${distribution[2]}`,
      `1 Star: ${distribution[1]}`,
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
        <Text style={s.loadingText}>Loading ratings...</Text>
      </View>
    );
  }

  if (fetchError && reviews.length === 0 && !profile) {
    return (
      <View style={s.centered}>
        <Ionicons name="warning" size={42} color={theme.danger || '#ef4444'} />
        <Text style={s.emptyTitle}>Cannot load ratings</Text>
        <Text style={s.emptyText}>{fetchError}</Text>

        <TouchableOpacity style={s.primaryBtn} onPress={() => fetchData(true)}>
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
              <Text style={s.kicker}>Mechanic Feedback</Text>
              <Text style={s.title}>My Ratings</Text>
              <Text style={s.subtitle}>
                Review your customer feedback, service comments, and rating performance.
              </Text>
            </View>

            <TouchableOpacity style={s.shareBtn} onPress={shareSummary}>
              <Ionicons name="share-social-outline" size={18} color={theme.text} />
            </TouchableOpacity>
          </View>

          <View style={s.profileBox}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>
                {`${profile?.first_name?.[0] || ''}${profile?.last_name?.[0] || ''}`.toUpperCase() ||
                  'M'}
              </Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={s.profileName}>{getName(profile)}</Text>
              <Text style={s.profileSub}>
                {profile?.specialization || 'Mechanic'}
              </Text>
            </View>
          </View>
        </View>

        <View style={s.ratingSummary}>
          <View style={s.ratingMain}>
            <Text style={s.ratingBig}>{ratingAverage ? ratingAverage.toFixed(1) : '—'}</Text>
            <StarRating theme={theme} rating={ratingAverage} size={20} />
            <Text style={s.ratingSub}>
              Based on {ratingCount} {ratingCount === 1 ? 'review' : 'reviews'}
            </Text>
          </View>

          <View style={s.ratingBars}>
            {[5, 4, 3, 2, 1].map((star) => {
              const count = distribution[star] || 0;
              const percent = reviews.length ? Math.round((count / reviews.length) * 100) : 0;

              return (
                <View key={star} style={s.ratingBarRow}>
                  <Text style={s.ratingBarLabel}>{star} ★</Text>
                  <View style={s.ratingBarOuter}>
                    <View style={[s.ratingBarInner, { width: `${percent}%` }]} />
                  </View>
                  <Text style={s.ratingBarCount}>{count}</Text>
                </View>
              );
            })}
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.statsRow}
        >
          <StatCard theme={theme} label="Total Reviews" value={ratingCount} icon="chatbubbles" />
          <StatCard
            theme={theme}
            label="Positive"
            value={positiveReviews}
            icon="thumbs-up"
            color={theme.success || '#22c55e'}
          />
          <StatCard
            theme={theme}
            label="Needs Focus"
            value={lowReviews}
            icon="alert-circle"
            color={theme.warning || '#eab308'}
          />
          <StatCard
            theme={theme}
            label="Average"
            value={ratingAverage ? ratingAverage.toFixed(1) : '—'}
            icon="star"
            color={YELLOW}
          />
        </ScrollView>

        {fetchError ? (
          <View style={s.inlineError}>
            <Ionicons name="warning-outline" size={17} color={theme.danger || '#ef4444'} />
            <Text style={s.inlineErrorText}>{fetchError}</Text>
          </View>
        ) : null}

        <View style={s.searchBox}>
          <Ionicons name="search" size={17} color={theme.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search customer, service, comment..."
            placeholderTextColor={theme.textMuted}
            style={s.searchInput}
          />
          {!!search && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={theme.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <Text style={s.filterLabel}>Rating</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chipRow}
        >
          {RATING_FILTERS.map((item) => {
            const active = ratingFilter === item.key;

            return (
              <TouchableOpacity
                key={item.key}
                style={[s.chip, active && s.chipActive]}
                onPress={() => setRatingFilter(item.key)}
              >
                <Text style={[s.chipText, active && s.chipTextActive]}>
                  {item.label}
                </Text>
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
                <Text style={[s.chipText, active && s.chipTextActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}

          {hasFilters && (
            <TouchableOpacity
              style={s.clearChip}
              onPress={() => {
                setSearch('');
                setRatingFilter('all');
                setSortBy('newest');
              }}
            >
              <Text style={s.clearChipText}>Clear</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        <View style={s.resultsRow}>
          <Text style={s.resultsText}>
            Showing {filteredReviews.length} of {reviews.length} review
            {reviews.length === 1 ? '' : 's'}
          </Text>
        </View>

        {filteredReviews.length === 0 ? (
          <View style={s.emptyCard}>
            <Ionicons name="star-outline" size={42} color={theme.textMuted} />
            <Text style={s.emptyTitle}>No reviews found</Text>
            <Text style={s.emptyText}>
              {reviews.length === 0
                ? 'Customer reviews will appear here after completed services are rated.'
                : 'Try changing your search, rating filter, or sort option.'}
            </Text>
          </View>
        ) : (
          filteredReviews.map((review) => (
            <View key={review.id} style={s.reviewCard}>
              <View style={s.reviewTop}>
                <View style={{ flex: 1 }}>
                  <Text style={s.customerName}>{getName(review.profiles)}</Text>
                  <Text style={s.reviewMeta}>
                    {review.bookings?.services?.name || 'Service Booking'} ·{' '}
                    {formatDate(review.created_at)}
                  </Text>
                </View>

                <View style={s.ratingPill}>
                  <Ionicons name="star" size={13} color={YELLOW} />
                  <Text style={s.ratingPillText}>{Number(review.rating) || 0}</Text>
                </View>
              </View>

              <Text style={s.commentText}>
                {review.comment?.trim() || 'No written comment provided.'}
              </Text>

              <View style={s.reviewFooter}>
                <View style={s.footerItem}>
                  <Ionicons name="calendar-outline" size={14} color={theme.textMuted} />
                  <Text style={s.footerText}>
                    {review.bookings?.booking_date
                      ? formatDate(review.bookings.booking_date)
                      : 'No booking date'}
                  </Text>
                </View>

                <View style={s.footerItem}>
                  <Ionicons name="bookmark-outline" size={14} color={theme.textMuted} />
                  <Text style={s.footerText}>
                    #{String(review.booking_id || review.id).slice(0, 8).toUpperCase()}
                  </Text>
                </View>
              </View>

              <StarRating theme={theme} rating={review.rating} size={15} />
            </View>
          ))
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
        <Ionicons name={icon} size={17} color={resolvedColor} />
      </View>
      <Text style={[s.statValue, { color: resolvedColor }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
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
      marginTop: 10,
      fontWeight: '700',
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
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: 4,
    },
    title: {
      color: theme.text,
      fontSize: 23,
      fontWeight: '900',
    },
    subtitle: {
      color: theme.textSub || theme.textMuted,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 5,
    },
    shareBtn: {
      width: 42,
      height: 42,
      borderRadius: 14,
      backgroundColor: theme.bg2,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    profileBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginTop: 16,
      paddingTop: 14,
      borderTopWidth: 1,
      borderTopColor: theme.border,
    },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: theme.primary + '22',
      borderWidth: 1,
      borderColor: theme.primary + '44',
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      color: theme.primaryLight || YELLOW,
      fontSize: 16,
      fontWeight: '900',
    },
    profileName: {
      color: theme.text,
      fontSize: 15,
      fontWeight: '900',
    },
    profileSub: {
      color: theme.textSub || theme.textMuted,
      fontSize: 12,
      marginTop: 2,
    },
    ratingSummary: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 18,
      padding: 16,
      marginBottom: 14,
    },
    ratingMain: {
      alignItems: 'center',
      marginBottom: 15,
    },
    ratingBig: {
      color: theme.text,
      fontSize: 42,
      fontWeight: '900',
      lineHeight: 48,
    },
    ratingSub: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '700',
      marginTop: 6,
    },
    ratingBars: {
      gap: 8,
    },
    ratingBarRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
    },
    ratingBarLabel: {
      width: 34,
      color: theme.text,
      fontSize: 12,
      fontWeight: '800',
    },
    ratingBarOuter: {
      flex: 1,
      height: 8,
      borderRadius: 999,
      backgroundColor: theme.bg2,
      overflow: 'hidden',
    },
    ratingBarInner: {
      height: '100%',
      backgroundColor: YELLOW,
      borderRadius: 999,
    },
    ratingBarCount: {
      width: 24,
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '800',
      textAlign: 'right',
    },
    statsRow: {
      gap: 10,
      paddingBottom: 14,
    },
    statCard: {
      width: 122,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 16,
      padding: 12,
    },
    statIcon: {
      width: 31,
      height: 31,
      borderRadius: 11,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 7,
    },
    statValue: {
      fontSize: 19,
      fontWeight: '900',
    },
    statLabel: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '800',
      marginTop: 2,
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
    searchBox: {
      height: 46,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 14,
      paddingHorizontal: 13,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      marginBottom: 12,
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
    clearChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: (theme.danger || '#ef4444') + '55',
      backgroundColor: (theme.danger || '#ef4444') + '10',
    },
    clearChipText: {
      color: theme.danger || '#ef4444',
      fontSize: 12,
      fontWeight: '900',
    },
    resultsRow: {
      marginBottom: 8,
    },
    resultsText: {
      color: theme.textMuted,
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
      marginTop: 10,
    },
    emptyText: {
      color: theme.textSub || theme.textMuted,
      fontSize: 13,
      textAlign: 'center',
      marginTop: 4,
      lineHeight: 19,
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
    reviewCard: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 16,
      padding: 14,
      marginBottom: 12,
    },
    reviewTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      marginBottom: 10,
    },
    customerName: {
      color: theme.text,
      fontSize: 15,
      fontWeight: '900',
    },
    reviewMeta: {
      color: theme.textMuted,
      fontSize: 11,
      marginTop: 2,
      lineHeight: 16,
    },
    ratingPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: YELLOW + '18',
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 5,
    },
    ratingPillText: {
      color: YELLOW,
      fontSize: 12,
      fontWeight: '900',
    },
    commentText: {
      color: theme.textSub || theme.text,
      fontSize: 13,
      lineHeight: 19,
      fontStyle: 'italic',
      marginBottom: 12,
    },
    reviewFooter: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      paddingTop: 10,
      marginBottom: 10,
    },
    footerItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    footerText: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
    },
  });
