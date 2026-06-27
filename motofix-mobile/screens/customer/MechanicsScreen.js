import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
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
import { useFocusEffect } from '@react-navigation/native';

import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';

const YELLOW = '#EAB308';

const SORT_OPTIONS = [
  { key: 'rating_desc', label: 'Top Rated' },
  { key: 'reviews_desc', label: 'Most Reviews' },
  { key: 'name_asc', label: 'Name A-Z' },
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

function getFullName(profile) {
  const name = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim();
  return name || 'Mechanic';
}

function getInitials(profile) {
  const first = profile?.first_name?.[0] || '';
  const last = profile?.last_name?.[0] || '';
  return `${first}${last}`.toUpperCase() || '?';
}

function isImageFile(url = '') {
  return /\.(png|jpe?g|webp|gif|bmp|svg)(\?.*)?$/i.test(String(url));
}

function StarRating({ theme, value = 0, size = 15, showNumber = false }) {
  const rating = Number(value) || 0;
  const rounded = Math.round(rating);

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
            marginLeft: 4,
          }}
        >
          {rating ? rating.toFixed(1) : '—'}
        </Text>
      )}
    </View>
  );
}

function buildRatingDistribution(reviews) {
  const result = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };

  (reviews || []).forEach((review) => {
    const rating = Number(review.rating);
    if (result[rating] !== undefined) {
      result[rating] += 1;
    }
  });

  return result;
}

export default function MechanicsScreen({ navigation }) {
  const { theme } = useTheme();
  const s = styles(theme);

  const [mechanics, setMechanics] = useState([]);
  const [selected, setSelected] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [loadingCerts, setLoadingCerts] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState('');

  const [search, setSearch] = useState('');
  const [specializationFilter, setSpecializationFilter] = useState('all');
  const [sortBy, setSortBy] = useState('rating_desc');
  const [certificatePreview, setCertificatePreview] = useState(null);

  useEffect(() => {
    navigation?.setOptions?.({
      title: 'Mechanics',
      headerBackTitle: 'Back',
    });
  }, [navigation]);

  const fetchMechanics = useCallback(async (showMainLoader = true) => {
    if (showMainLoader) setLoading(true);
    setFetchError('');

    let { data, error } = await supabase
      .from('profiles')
      .select(
        'id, first_name, last_name, phone, email, profile_photo_url, specialization, rating_avg, rating_count'
      )
      .eq('role', 'mechanic')
      .order('first_name', { ascending: true });

    if (error) {
      console.log('Mechanics profile_photo_url query failed, retrying safe query:', error.message);

      const fallback = await supabase
        .from('profiles')
        .select('id, first_name, last_name, phone, email, specialization, rating_avg, rating_count')
        .eq('role', 'mechanic')
        .order('first_name', { ascending: true });

      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      setFetchError(error.message || 'Failed to load mechanics.');
      setMechanics([]);
    } else {
      setMechanics(data || []);
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  const fetchReviews = useCallback(async (mechanicId) => {
    if (!mechanicId) {
      setReviews([]);
      return;
    }

    setLoadingReviews(true);

    const { data, error } = await supabase
      .from('mechanic_ratings')
      .select(
        `
        id,
        rating,
        comment,
        created_at,
        profiles!mechanic_ratings_customer_id_fkey (
          first_name,
          last_name
        ),
        bookings!mechanic_ratings_booking_id_fkey (
          id,
          booking_date,
          services (
            name
          )
        )
      `
      )
      .eq('mechanic_id', mechanicId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.log('Mechanic reviews unavailable:', error.message);
      setReviews([]);
    } else {
      setReviews(data || []);
    }

    setLoadingReviews(false);
  }, []);

  const fetchCertificates = useCallback(async (mechanicId) => {
    if (!mechanicId) {
      setCertificates([]);
      return;
    }

    setLoadingCerts(true);

    const { data, error } = await supabase
      .from('mechanic_certificates')
      .select('*')
      .eq('mechanic_id', mechanicId)
      .order('created_at', { ascending: false });

    if (error) {
      console.log('Mechanic certificates unavailable:', error.message);
      setCertificates([]);
    } else {
      setCertificates(data || []);
    }

    setLoadingCerts(false);
  }, []);

  useEffect(() => {
    fetchMechanics(true);

    const profileChannel = supabase
      .channel('mobile-customer-mechanics-profiles')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
        },
        () => fetchMechanics(false)
      )
      .subscribe();

    const ratingsChannel = supabase
      .channel('mobile-customer-mechanics-ratings')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'mechanic_ratings',
        },
        () => {
          fetchMechanics(false);
          if (selected?.id) fetchReviews(selected.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(profileChannel);
      supabase.removeChannel(ratingsChannel);
    };
  }, [fetchMechanics, fetchReviews, selected?.id]);

  useFocusEffect(
    useCallback(() => {
      fetchMechanics(false);
    }, [fetchMechanics])
  );

  function onRefresh() {
    setRefreshing(true);
    fetchMechanics(false);
    if (selected?.id) {
      fetchReviews(selected.id);
      fetchCertificates(selected.id);
    }
  }

  async function openProfile(mechanic) {
    setSelected(mechanic);
    setReviews([]);
    setCertificates([]);
    setCertificatePreview(null);
    fetchReviews(mechanic.id);
    fetchCertificates(mechanic.id);
  }

  function closeProfile() {
    setSelected(null);
    setReviews([]);
    setCertificates([]);
    setCertificatePreview(null);
  }

  function callMechanic(phone) {
    if (phone) {
      Linking.openURL(`tel:${phone}`);
    }
  }

  function emailMechanic(email) {
    if (email) {
      Linking.openURL(`mailto:${email}`);
    }
  }

  async function openCertificate(certificate) {
    const url = certificate?.file_url || certificate?.url || certificate?.certificate_url;

    if (!url) return;

    if (isImageFile(url)) {
      setCertificatePreview({
        url,
        name: certificate?.name || 'Certificate',
      });
      return;
    }

    try {
      await Linking.openURL(url);
    } catch (error) {
      console.log('Could not open certificate:', error.message);
    }
  }

  const specializations = useMemo(() => {
    const list = mechanics
      .map((mechanic) => String(mechanic.specialization || '').trim())
      .filter(Boolean);

    return ['all', ...Array.from(new Set(list)).sort((a, b) => a.localeCompare(b))];
  }, [mechanics]);

  const filteredMechanics = useMemo(() => {
    const query = search.trim().toLowerCase();

    let result = mechanics.filter((mechanic) => {
      const fullName = getFullName(mechanic);
      const haystack = [
        fullName,
        mechanic.specialization,
        mechanic.phone,
        mechanic.email,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const matchesSearch = !query || haystack.includes(query);
      const matchesSpecialization =
        specializationFilter === 'all' || mechanic.specialization === specializationFilter;

      return matchesSearch && matchesSpecialization;
    });

    result = [...result].sort((a, b) => {
      const ratingA = Number(a.rating_avg) || 0;
      const ratingB = Number(b.rating_avg) || 0;
      const reviewsA = Number(a.rating_count) || 0;
      const reviewsB = Number(b.rating_count) || 0;
      const nameA = getFullName(a);
      const nameB = getFullName(b);

      if (sortBy === 'reviews_desc') return reviewsB - reviewsA || ratingB - ratingA;
      if (sortBy === 'name_asc') return nameA.localeCompare(nameB);

      return ratingB - ratingA || reviewsB - reviewsA || nameA.localeCompare(nameB);
    });

    return result;
  }, [mechanics, search, sortBy, specializationFilter]);

  const stats = useMemo(() => {
    const withReviews = mechanics.filter((mechanic) => Number(mechanic.rating_count) > 0).length;
    const avg =
      mechanics.length > 0
        ? mechanics.reduce((sum, mechanic) => sum + (Number(mechanic.rating_avg) || 0), 0) /
          mechanics.length
        : 0;

    return {
      total: mechanics.length,
      withReviews,
      average: avg,
      specializations: specializations.length > 0 ? specializations.length - 1 : 0,
    };
  }, [mechanics, specializations.length]);

  const ratingDistribution = useMemo(() => buildRatingDistribution(reviews), [reviews]);
  const selectedRating = Number(selected?.rating_avg) || 0;
  const selectedRatingCount = Number(selected?.rating_count) || reviews.length || 0;
  const hasFilters = search.trim() || specializationFilter !== 'all' || sortBy !== 'rating_desc';

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={theme.primaryLight || YELLOW} />
        <Text style={s.loadingText}>Loading mechanics...</Text>
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
          <Text style={s.kicker}>MotoFix Service Team</Text>
          <Text style={s.title}>Our Mechanics</Text>
          <Text style={s.subtitle}>
            Browse the mechanics who handle motorcycle inspections, repairs, upgrades, and maintenance.
          </Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.statsRow}
        >
          <StatCard theme={theme} label="Mechanics" value={stats.total} icon="people" />
          <StatCard theme={theme} label="With Reviews" value={stats.withReviews} icon="star" />
          <StatCard
            theme={theme}
            label="Avg Rating"
            value={stats.average ? stats.average.toFixed(1) : '—'}
            icon="analytics"
          />
          <StatCard
            theme={theme}
            label="Specialties"
            value={stats.specializations}
            icon="construct"
          />
        </ScrollView>

        {fetchError ? (
          <View style={s.errorBox}>
            <Ionicons name="warning-outline" size={18} color={theme.danger || '#ef4444'} />
            <Text style={s.errorText}>{fetchError}</Text>
          </View>
        ) : null}

        <View style={s.searchBox}>
          <Ionicons name="search" size={17} color={theme.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search mechanic or specialization..."
            placeholderTextColor={theme.textMuted}
            style={s.searchInput}
          />
          {!!search && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={theme.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <Text style={s.filterLabel}>Specialization</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chipRow}
        >
          {specializations.map((item) => {
            const active = specializationFilter === item;

            return (
              <TouchableOpacity
                key={item}
                style={[s.chip, active && s.chipActive]}
                onPress={() => setSpecializationFilter(item)}
              >
                <Text style={[s.chipText, active && s.chipTextActive]}>
                  {item === 'all' ? 'All Specializations' : item}
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
                <Text style={[s.chipText, active && s.chipTextActive]}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}

          {hasFilters && (
            <TouchableOpacity
              style={s.clearChip}
              onPress={() => {
                setSearch('');
                setSpecializationFilter('all');
                setSortBy('rating_desc');
              }}
            >
              <Text style={s.clearChipText}>Clear</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        <View style={s.resultsRow}>
          <Text style={s.resultsText}>
            Showing {filteredMechanics.length} of {mechanics.length}
          </Text>
        </View>

        {filteredMechanics.length === 0 ? (
          <View style={s.emptyCard}>
            <Ionicons name="person-circle-outline" size={42} color={theme.textMuted} />
            <Text style={s.emptyTitle}>No mechanics found</Text>
            <Text style={s.emptyText}>Try another search term or clear the filters.</Text>
          </View>
        ) : (
          filteredMechanics.map((mechanic) => (
            <TouchableOpacity
              key={mechanic.id}
              style={s.mechanicCard}
              activeOpacity={0.78}
              onPress={() => openProfile(mechanic)}
            >
              <View style={s.cardTop}>
                <Avatar theme={theme} profile={mechanic} size={62} />

                <View style={{ flex: 1 }}>
                  <Text style={s.mechanicName}>{getFullName(mechanic)}</Text>
                  <Text style={s.mechanicRole}>
                    Mechanic{mechanic.specialization ? ` · ${mechanic.specialization}` : ''}
                  </Text>

                  <View style={s.ratingLine}>
                    <StarRating theme={theme} value={mechanic.rating_avg} size={14} showNumber />
                    <Text style={s.reviewCount}>
                      {Number(mechanic.rating_count) || 0} reviews
                    </Text>
                  </View>
                </View>

                <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
              </View>

              <View style={s.cardFooter}>
                {mechanic.phone ? (
                  <TouchableOpacity
                    style={s.smallAction}
                    onPress={() => callMechanic(mechanic.phone)}
                  >
                    <Ionicons name="call" size={14} color={theme.primaryLight || YELLOW} />
                    <Text style={s.smallActionText}>Call</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={s.smallActionMuted}>
                    <Ionicons name="call-outline" size={14} color={theme.textMuted} />
                    <Text style={s.smallActionMutedText}>No phone</Text>
                  </View>
                )}

                <View style={s.smallAction}>
                  <Ionicons name="eye" size={14} color={theme.primaryLight || YELLOW} />
                  <Text style={s.smallActionText}>View Profile</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <Modal
        visible={!!selected}
        transparent
        animationType="slide"
        onRequestClose={closeProfile}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                <Avatar theme={theme} profile={selected} size={58} />
                <View style={{ flex: 1 }}>
                  <Text style={s.modalName}>{getFullName(selected)}</Text>
                  <Text style={s.modalSub}>
                    Mechanic{selected?.specialization ? ` · ${selected.specialization}` : ''}
                  </Text>
                </View>
              </View>

              <TouchableOpacity style={s.closeBtn} onPress={closeProfile}>
                <Ionicons name="close" size={22} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={s.modalContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={s.ratingCard}>
                <View style={{ alignItems: 'center', marginBottom: 14 }}>
                  <Text style={s.ratingBig}>{selectedRating ? selectedRating.toFixed(1) : '—'}</Text>
                  <StarRating theme={theme} value={selectedRating} size={19} />
                  <Text style={s.ratingSub}>
                    Based on {selectedRatingCount} {selectedRatingCount === 1 ? 'review' : 'reviews'}
                  </Text>
                </View>

                {[5, 4, 3, 2, 1].map((star) => {
                  const count = ratingDistribution[star] || 0;
                  const percent = reviews.length ? Math.round((count / reviews.length) * 100) : 0;

                  return (
                    <View key={star} style={s.ratingBreakRow}>
                      <Text style={s.ratingBreakLabel}>{star} ★</Text>
                      <View style={s.ratingBarOuter}>
                        <View style={[s.ratingBarInner, { width: `${percent}%` }]} />
                      </View>
                      <Text style={s.ratingBreakCount}>{count}</Text>
                    </View>
                  );
                })}
              </View>

              {(selected?.phone || selected?.email) && (
                <View style={s.modalActions}>
                  {!!selected?.phone && (
                    <TouchableOpacity
                      style={s.modalActionBtn}
                      onPress={() => callMechanic(selected.phone)}
                    >
                      <Ionicons name="call" size={16} color="#fff" />
                      <Text style={s.modalActionText}>Call</Text>
                    </TouchableOpacity>
                  )}

                  {!!selected?.email && (
                    <TouchableOpacity
                      style={s.modalActionBtn}
                      onPress={() => emailMechanic(selected.email)}
                    >
                      <Ionicons name="mail" size={16} color="#fff" />
                      <Text style={s.modalActionText}>Email</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              <SectionTitle theme={theme} title="Certifications" count={certificates.length} />

              {loadingCerts ? (
                <View style={s.loadingBlock}>
                  <ActivityIndicator color={theme.primaryLight || YELLOW} />
                  <Text style={s.loadingSmall}>Loading certificates...</Text>
                </View>
              ) : certificates.length === 0 ? (
                <View style={s.emptyMini}>
                  <Ionicons name="ribbon-outline" size={24} color={theme.textMuted} />
                  <Text style={s.emptyMiniText}>No certifications on file.</Text>
                </View>
              ) : (
                certificates.map((certificate) => {
                  const fileUrl =
                    certificate.file_url || certificate.url || certificate.certificate_url;

                  return (
                    <TouchableOpacity
                      key={certificate.id || fileUrl}
                      style={s.certificateRow}
                      onPress={() => openCertificate(certificate)}
                      activeOpacity={0.76}
                    >
                      <View style={s.certificateIcon}>
                        <Ionicons
                          name={isImageFile(fileUrl) ? 'image' : 'document-text'}
                          size={20}
                          color={theme.primaryLight || YELLOW}
                        />
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={s.certificateName}>
                          {certificate.name || certificate.title || 'Certificate'}
                        </Text>
                        <Text style={s.certificateSub}>
                          {certificate.verified ? 'Verified · ' : ''}
                          {formatDate(certificate.created_at)}
                        </Text>
                      </View>

                      <Ionicons name="open-outline" size={17} color={theme.textMuted} />
                    </TouchableOpacity>
                  );
                })
              )}

              <SectionTitle theme={theme} title="Customer Reviews" count={reviews.length} />

              {loadingReviews ? (
                <View style={s.loadingBlock}>
                  <ActivityIndicator color={theme.primaryLight || YELLOW} />
                  <Text style={s.loadingSmall}>Loading reviews...</Text>
                </View>
              ) : reviews.length === 0 ? (
                <View style={s.emptyMini}>
                  <Ionicons name="chatbubble-ellipses-outline" size={24} color={theme.textMuted} />
                  <Text style={s.emptyMiniText}>No reviews yet.</Text>
                </View>
              ) : (
                reviews.map((review, index) => (
                  <View
                    key={review.id || `${review.created_at}-${index}`}
                    style={s.reviewCard}
                  >
                    <View style={s.reviewTop}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.reviewerName}>
                          {getFullName(review.profiles || {}) === 'Mechanic'
                            ? 'Customer'
                            : getFullName(review.profiles)}
                        </Text>
                        <Text style={s.reviewMeta}>
                          {review.bookings?.services?.name || 'Service'} ·{' '}
                          {formatDate(review.created_at)}
                        </Text>
                      </View>

                      <StarRating theme={theme} value={review.rating} size={13} />
                    </View>

                    <Text style={s.reviewComment}>
                      {review.comment?.trim() || 'No written comment.'}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!certificatePreview}
        transparent
        animationType="fade"
        onRequestClose={() => setCertificatePreview(null)}
      >
        <TouchableOpacity
          style={s.previewOverlay}
          activeOpacity={1}
          onPress={() => setCertificatePreview(null)}
        >
          <View style={s.previewHeader}>
            <Text style={s.previewTitle}>{certificatePreview?.name || 'Certificate'}</Text>
            <Ionicons name="close" size={24} color="#fff" />
          </View>

          {!!certificatePreview?.url && (
            <Image
              source={{ uri: certificatePreview.url }}
              style={s.previewImage}
              resizeMode="contain"
            />
          )}
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function Avatar({ theme, profile, size = 54 }) {
  const s = styles(theme);

  if (profile?.profile_photo_url) {
    return (
      <Image
        source={{ uri: profile.profile_photo_url }}
        style={[
          s.avatar,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}
      />
    );
  }

  return (
    <View
      style={[
        s.avatarFallback,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}
    >
      <Text style={[s.avatarInitials, { fontSize: Math.max(15, size / 3.4) }]}>
        {getInitials(profile)}
      </Text>
    </View>
  );
}

function StatCard({ theme, label, value, icon }) {
  const s = styles(theme);

  return (
    <View style={s.statCard}>
      <View style={s.statIcon}>
        <Ionicons name={icon} size={17} color={theme.primaryLight || YELLOW} />
      </View>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function SectionTitle({ theme, title, count }) {
  const s = styles(theme);

  return (
    <View style={s.sectionTitleRow}>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.countBadge}>
        <Text style={s.countText}>{count}</Text>
      </View>
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
    statsRow: {
      gap: 10,
      paddingBottom: 14,
    },
    statCard: {
      width: 118,
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
      backgroundColor: (theme.primaryLight || YELLOW) + '18',
      marginBottom: 7,
    },
    statValue: {
      color: theme.text,
      fontSize: 19,
      fontWeight: '900',
    },
    statLabel: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '800',
      marginTop: 2,
    },
    errorBox: {
      flexDirection: 'row',
      gap: 8,
      backgroundColor: (theme.danger || '#ef4444') + '14',
      borderWidth: 1,
      borderColor: (theme.danger || '#ef4444') + '44',
      borderRadius: 14,
      padding: 12,
      marginBottom: 12,
    },
    errorText: {
      flex: 1,
      color: theme.danger || '#ef4444',
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 18,
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
      marginTop: 4,
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
    mechanicCard: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 17,
      padding: 14,
      marginBottom: 12,
    },
    cardTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    avatar: {
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.bg2,
    },
    avatarFallback: {
      borderWidth: 1,
      borderColor: theme.primary + '44',
      backgroundColor: theme.primary + '20',
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarInitials: {
      color: theme.primaryLight || YELLOW,
      fontWeight: '900',
    },
    mechanicName: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '900',
    },
    mechanicRole: {
      color: theme.textSub || theme.textMuted,
      fontSize: 12,
      marginTop: 2,
      lineHeight: 17,
    },
    ratingLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 6,
      flexWrap: 'wrap',
    },
    reviewCount: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
    },
    cardFooter: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 12,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      paddingTop: 11,
    },
    smallAction: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: theme.bg2,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    smallActionText: {
      color: theme.text,
      fontSize: 11,
      fontWeight: '900',
    },
    smallActionMuted: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: theme.bg2,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      opacity: 0.75,
    },
    smallActionMutedText: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '800',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.58)',
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: theme.bg,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      maxHeight: '92%',
      overflow: 'hidden',
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      backgroundColor: theme.card,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      gap: 12,
    },
    modalName: {
      color: theme.text,
      fontSize: 17,
      fontWeight: '900',
    },
    modalSub: {
      color: theme.textSub || theme.textMuted,
      fontSize: 12,
      marginTop: 2,
    },
    closeBtn: {
      width: 40,
      height: 40,
      borderRadius: 14,
      backgroundColor: theme.bg2,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.border,
    },
    modalContent: {
      padding: 16,
      paddingBottom: 34,
    },
    ratingCard: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 16,
      padding: 15,
      marginBottom: 14,
    },
    ratingBig: {
      color: theme.text,
      fontSize: 38,
      fontWeight: '900',
      lineHeight: 44,
    },
    ratingSub: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '700',
      marginTop: 5,
    },
    ratingBreakRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 8,
    },
    ratingBreakLabel: {
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
    ratingBreakCount: {
      width: 22,
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '800',
      textAlign: 'right',
    },
    modalActions: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 14,
    },
    modalActionBtn: {
      flex: 1,
      backgroundColor: theme.primary,
      borderRadius: 13,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
    },
    modalActionText: {
      color: '#fff',
      fontSize: 13,
      fontWeight: '900',
    },
    sectionTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 4,
      marginBottom: 9,
      gap: 8,
    },
    sectionTitle: {
      flex: 1,
      color: theme.text,
      fontSize: 16,
      fontWeight: '900',
    },
    countBadge: {
      backgroundColor: theme.bg2,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 4,
    },
    countText: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '900',
    },
    loadingBlock: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 14,
      padding: 18,
      alignItems: 'center',
      marginBottom: 14,
    },
    loadingSmall: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '700',
      marginTop: 8,
    },
    emptyMini: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 14,
      padding: 18,
      alignItems: 'center',
      marginBottom: 14,
    },
    emptyMiniText: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '700',
      marginTop: 6,
      textAlign: 'center',
    },
    certificateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 14,
      padding: 12,
      marginBottom: 9,
    },
    certificateIcon: {
      width: 40,
      height: 40,
      borderRadius: 13,
      backgroundColor: (theme.primaryLight || YELLOW) + '16',
      alignItems: 'center',
      justifyContent: 'center',
    },
    certificateName: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '900',
    },
    certificateSub: {
      color: theme.textMuted,
      fontSize: 11,
      marginTop: 2,
      fontWeight: '700',
    },
    reviewCard: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 14,
      padding: 13,
      marginBottom: 10,
    },
    reviewTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    reviewerName: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '900',
    },
    reviewMeta: {
      color: theme.textMuted,
      fontSize: 11,
      marginTop: 2,
      lineHeight: 16,
    },
    reviewComment: {
      color: theme.textSub || theme.text,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 9,
      fontStyle: 'italic',
    },
    previewOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.92)',
      padding: 16,
      justifyContent: 'center',
    },
    previewHeader: {
      position: 'absolute',
      top: 42,
      left: 16,
      right: 16,
      zIndex: 2,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    previewTitle: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '900',
      flex: 1,
      marginRight: 12,
    },
    previewImage: {
      width: '100%',
      height: '82%',
      borderRadius: 16,
    },
  });
