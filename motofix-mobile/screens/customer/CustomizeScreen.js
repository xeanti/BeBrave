import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  TextInput,
  StatusBar,
  Modal,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../lib/supabase';
import { CONSENT_TYPES, requireCustomerConsent } from '../../lib/consents';
import { useTheme } from '../../lib/ThemeContext';
const MAX_PREVIEW_PARTS = 2;

export default function CustomizeScreen() {
  const { theme, isDark } = useTheme();
  const [step, setStep] = useState(1);

  const [imageSource, setImageSource] = useState('');

  const [models, setModels] = useState([]);
  const [selectedModelId, setSelectedModelId] = useState('');

  const [ownPhotoUri, setOwnPhotoUri] = useState(null);
  const [ownPhotoBase64, setOwnPhotoBase64] = useState(null);
  const [ownMake, setOwnMake] = useState('');
  const [ownModel, setOwnModel] = useState('');

  const [parts, setParts] = useState([]);
  const [selectedParts, setSelectedParts] = useState([]);
  const [partSearch, setPartSearch] = useState('');
  const [partCategory, setPartCategory] = useState('all');

  const [resultImage, setResultImage] = useState(null);
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [user, setUser] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
    fetchModels();
    fetchParts();
  }, []);

  async function fetchModels() {
    const { data } = await supabase
      .from('motorcycle_models')
      .select('*')
      .order('make');

    if (data) setModels(data);
  }

  async function fetchParts() {
    const { data, error: fetchError } = await supabase
      .from('parts')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (fetchError) {
      console.error('Failed to fetch preview parts:', fetchError);
      return;
    }

    const previewableParts = (data || []).filter(
      (part) =>
        part.is_active === true &&
        part.is_previewable !== false
    );

    setParts(previewableParts);
  }

  function resetDownstream() {
    setSelectedParts([]);
    setResultImage(null);
    setImagePreviewOpen(false);
    setPartSearch('');
    setPartCategory('all');
    setError('');
  }

  function chooseSource(source) {
    setImageSource(source);
    setSelectedModelId('');
    setOwnPhotoUri(null);
    setOwnPhotoBase64(null);
    setOwnMake('');
    setOwnModel('');
    resetDownstream();
  }

  async function pickImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo library access.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      setOwnPhotoUri(result.assets[0].uri);
      setOwnPhotoBase64(result.assets[0].base64);
      resetDownstream();
    }
  }

  async function takePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();

    if (status !== 'granted') {
      Alert.alert(
        'Permission needed',
        'Please allow camera access so you can capture your motorcycle photo.'
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
      base64: true,
      cameraType: ImagePicker.CameraType.back,
    });

    if (!result.canceled && result.assets[0]) {
      setOwnPhotoUri(result.assets[0].uri);
      setOwnPhotoBase64(result.assets[0].base64);
      resetDownstream();
    }
  }

  function togglePart(partId) {
    const targetPart = parts.find((p) => p.id === partId);
    if (!targetPart) return;

    setSelectedParts((prev) => {
      if (prev.includes(partId)) {
        return prev.filter((id) => id !== partId);
      }

      const selectedPartDetails = parts.filter((p) => prev.includes(p.id));

      const categoryAlreadySelected = selectedPartDetails.some(
        (p) => p.category && p.category === targetPart.category
      );

      if (categoryAlreadySelected) {
        Alert.alert(
          'Category conflict',
          `You already have a "${targetPart.category}" part selected.`
        );
        return prev;
      }

      if (prev.length >= MAX_PREVIEW_PARTS) {
  Alert.alert(
    'Limit reached',
    `You can select up to ${MAX_PREVIEW_PARTS} parts.`
  );
  return prev;
}

      return [...prev, partId];
    });
  }

  const selectedModel = models.find((m) => m.id === selectedModelId);

  const motorcycleLabel =
    imageSource === 'reference' && selectedModel
      ? `${selectedModel.make} ${selectedModel.model}`
      : imageSource === 'own'
        ? `${ownMake} ${ownModel}`.trim()
        : '';

  const compatibleParts = useMemo(() => {
    const term = motorcycleLabel.trim().toLowerCase();
    const activePreviewParts = parts.filter(
      (part) =>
        part.is_active === true &&
        part.is_previewable !== false
    );

    if (!term) return activePreviewParts;

    return activePreviewParts.filter((part) => {
      const compatibleModels = Array.isArray(part.compatible_models)
        ? part.compatible_models
        : [];

      if (compatibleModels.length === 0) {
        return true;
      }

      return compatibleModels.some((model) => {
        const modelText = String(model || '').toLowerCase().trim();

        return modelText.includes(term) || term.includes(modelText);
      });
    });
  }, [parts, motorcycleLabel]);

  const categories = [
    'all',
    ...new Set(compatibleParts.map((p) => p.category).filter(Boolean)),
  ];

  const filteredParts = compatibleParts.filter((p) => {
    const isActive = p.is_active === true;
    const isPreviewable = p.is_previewable !== false;

    const matchSearch = String(p.name || '')
      .toLowerCase()
      .includes(partSearch.toLowerCase());

    const matchCategory = partCategory === 'all' || p.category === partCategory;

    return isActive && isPreviewable && matchSearch && matchCategory;
  });

  function getBasePhotoContext() {
    if (imageSource === 'own') {
      return [
        'Customer uploaded/captured photo.',
        'The photo may be either a full motorcycle side profile or a closer photo of the part installation location.',
        'If the photo is a close-up, treat the visible installation area as the locked base area and edit only the selected part location inside that close-up.',
        'Use surrounding bolts, mounts, panels, fork, swingarm, wheel, exhaust bracket, headlight housing, or nearby body panels as alignment guides.',
        'Do not zoom out, invent missing motorcycle areas, change the motorcycle body color, or replace the photo with a different motorcycle.',
      ].join(' ');
    }

    return [
      'Catalog reference full-motorcycle photo.',
      'Treat the whole motorcycle photo as the locked base image.',
      'Edit only the selected part locations and preserve the body color, decals, lighting, angle, and background.',
    ].join(' ');
  }

  async function handleGenerate() {
    setError('');

    if (!user?.id) {
      Alert.alert('Login Required', 'Please login before generating an AI preview.');
      return;
    }

    const acceptedAiConsent = await requireCustomerConsent({
      consentType: CONSENT_TYPES.AI_PHOTO,
      title: 'AI Photo Processing Consent',
      message:
        'MotoFix will process your motorcycle photo, selected parts, and customization details to generate an AI preview. The preview is for visualization only and may not be perfectly accurate.',
    });

    if (!acceptedAiConsent) return;

    setLoading(true);
    setResultImage(null);

    try {
      let photoUrl;

      if (imageSource === 'reference') {
        photoUrl = selectedModel.reference_photo_url;
      } else {
        if (!ownPhotoUri || !ownPhotoBase64) {
          throw new Error('Please select a valid motorcycle photo first.');
        }

        const ext = ownPhotoUri.split('.').pop() || 'jpg';
        const filePath = `${user.id}/${Date.now()}.${ext}`;
        const base64Data = ownPhotoBase64;

        const byteCharacters = atob(base64Data);
        const byteArray = new Uint8Array(byteCharacters.length);

        for (let i = 0; i < byteCharacters.length; i++) {
          byteArray[i] = byteCharacters.charCodeAt(i);
        }

        const { error: uploadError } = await supabase.storage
          .from('motorcycle-photos')
          .upload(filePath, byteArray, { contentType: `image/${ext}` });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('motorcycle-photos')
          .getPublicUrl(filePath);

        photoUrl = urlData.publicUrl;
      }

      const selectedPartDetails = parts.filter((p) =>
        selectedParts.includes(p.id)
      );

      const nonPreviewableParts = selectedPartDetails.filter(
        (part) => part.is_previewable === false
      );

      if (nonPreviewableParts.length > 0) {
        throw new Error(
          `These items cannot be previewed visually: ${nonPreviewableParts
            .map((part) => part.name)
            .join(', ')}. Consumables like oils, brake fluids, coolant, grease, and cleaners can be purchased in the shop but cannot be shown in AI Preview.`
        );
      }

      const partNames = selectedPartDetails.map((p) => p.name).join(', ');

      const { data: fnData, error: fnError } =
        await supabase.functions.invoke('generate-preview', {
          body: {
            photoUrl,
            partNames,
            partDetails: selectedPartDetails,
            motorcycleLabel: motorcycleLabel || 'Customer motorcycle',
            imageSource,
            basePhotoSource:
              imageSource === 'reference'
                ? 'reference_photo_url_locked'
                : 'customer_uploaded_or_captured_photo',
            basePhotoContext: getBasePhotoContext(),
          },
        });

      if (fnError) {
        console.error('Function invoke error:', fnError);
        throw new Error(fnError.message || 'AI preview failed. Please try again.');
      }

      if (fnData?.success === false) {
        throw new Error(fnData.error || 'AI preview failed. Please try again.');
      }

      if (!fnData?.imageUrl) {
        throw new Error('The preview generator did not return an image URL.');
      }

      setResultImage(fnData.imageUrl);

      await supabase.from('customizations').insert({
        customer_id: user.id,
        part_ids: selectedParts,
        original_photo_url: photoUrl,
        preview_image_url: fnData.imageUrl || null,
        prompt_used: fnData.prompt,
        status: 'generated',
      });
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to generate preview. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const s = styles(theme);

  return (
    <View style={s.container}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.bg}
      />

      <View style={s.progressBar}>
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={s.progressStep}>
            <View style={[s.progressDot, step >= i && s.progressDotActive]}>
              <Text style={[s.progressNum, step >= i && s.progressNumActive]}>
                {i}
              </Text>
            </View>

            {i < 4 && (
              <View
                style={[s.progressLine, step > i && s.progressLineActive]}
              />
            )}
          </View>
        ))}
      </View>

      <ScrollView
        style={s.scrollContainer}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        {step === 1 && (
          <View>
            <Text style={s.title}>Choose Photo Source</Text>
            <Text style={s.subtitle}>
              How do you want to provide your base motorcycle photo?
            </Text>

            <TouchableOpacity
              style={[
                s.sourceCard,
                imageSource === 'own' && s.sourceCardActive,
              ]}
              onPress={() => chooseSource('own')}
              activeOpacity={0.8}
            >
              <Text style={s.sourceIcon}>📤</Text>
              <Text
                style={[
                  s.sourceTitle,
                  imageSource === 'own' && s.sourceTextActive,
                ]}
              >
                My Photo
              </Text>
              <Text style={s.sourceDesc}>
                Upload a side-profile photo of your own motorcycle for a
                personalized preview.
              </Text>

              {imageSource === 'own' && (
                <View style={s.sourceCheck}>
                  <Text style={s.sourceCheckText}>✓ Selected</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                s.sourceCard,
                imageSource === 'reference' && s.sourceCardActive,
              ]}
              onPress={() => chooseSource('reference')}
              activeOpacity={0.8}
            >
              <Text style={s.sourceIcon}>🏍️</Text>
              <Text
                style={[
                  s.sourceTitle,
                  imageSource === 'reference' && s.sourceTextActive,
                ]}
              >
                Our Models
              </Text>
              <Text style={s.sourceDesc}>
                Browse our verified catalog of motorcycle reference photos and
                pick your model.
              </Text>

              {imageSource === 'reference' && (
                <View style={s.sourceCheck}>
                  <Text style={s.sourceCheckText}>✓ Selected</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        )}

        {step === 2 && (
          <View>
            {imageSource === 'own' ? (
              <View>
                <Text style={s.title}>Upload Your Photo</Text>
                <Text style={s.subtitle}>
                  Use a full side-view photo for the whole bike, or take a closer photo of the exact installation area for better accuracy.
                </Text>

                <View style={[s.photoPicker, ownPhotoUri && s.photoPickerFilled]}>
                  {ownPhotoUri ? (
                    <>
                      <Image
                        source={{ uri: ownPhotoUri }}
                        style={s.photoPickerImage}
                        resizeMode="cover"
                      />
                      <View style={s.photoPickerOverlay}>
                        <Text style={s.photoPickerOverlayText}>
                          Motorcycle photo selected
                        </Text>
                      </View>
                    </>
                  ) : (
                    <View style={s.photoPickerEmpty}>
                      <Text style={s.photoPickerEmptyIcon}>📷</Text>
                      <Text style={s.photoPickerEmptyTitle}>
                        Add your motorcycle photo
                      </Text>
                      <Text style={s.photoPickerEmptyHint}>
                        Take a new photo or upload from gallery
                      </Text>
                    </View>
                  )}
                </View>

                <View style={s.photoActionRow}>
                  <TouchableOpacity
                    style={s.photoActionBtn}
                    onPress={takePhoto}
                    activeOpacity={0.8}
                  >
                    <Text style={s.photoActionIcon}>📸</Text>
                    <Text style={s.photoActionTitle}>Take Photo</Text>
                    <Text style={s.photoActionSub}>Use camera</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={s.photoActionBtn}
                    onPress={pickImage}
                    activeOpacity={0.8}
                  >
                    <Text style={s.photoActionIcon}>🖼️</Text>
                    <Text style={s.photoActionTitle}>
                      {ownPhotoUri ? 'Change Photo' : 'Upload Photo'}
                    </Text>
                    <Text style={s.photoActionSub}>From gallery</Text>
                  </TouchableOpacity>
                </View>

                <View style={s.tipsCard}>
                  <Text style={s.tipsTitle}>📸 Photo tips</Text>

                  {[
                    'Whole-bike preview: capture the full motorcycle from the left or right side',
                    'Specific part preview: move closer to the installation area, such as the wheel, exhaust, headlight, mirror, or seat',
                    'Keep nearby mounts, bolts, brackets, panels, and surrounding parts visible so the AI knows where to install the part',
                    'Use good lighting, avoid blur, and avoid extreme close-ups that remove all surrounding reference points',
                  ].map((tip, i) => (
                    <View key={i} style={s.tipRow}>
                      <Text style={s.tipDot}>·</Text>
                      <Text style={s.tipText}>{tip}</Text>
                    </View>
                  ))}
                </View>

                <Text style={s.sectionLabel}>
                  Brand details <Text style={s.optionalLabel}>(optional)</Text>
                </Text>

                <View style={s.inputRow}>
                  <TextInput
                    style={[
                      s.input,
                      { flex: 1, marginRight: 8, marginBottom: 0 },
                    ]}
                    placeholder="Make  e.g. Honda"
                    placeholderTextColor={theme.textMuted}
                    value={ownMake}
                    onChangeText={setOwnMake}
                  />

                  <TextInput
                    style={[s.input, { flex: 1, marginBottom: 0 }]}
                    placeholder="Model  e.g. Click 125i"
                    placeholderTextColor={theme.textMuted}
                    value={ownModel}
                    onChangeText={setOwnModel}
                  />
                </View>
              </View>
            ) : (
              <View>
                <Text style={s.title}>Select a Model</Text>
                <Text style={s.subtitle}>
                  Pick from our verified motorcycle catalog.
                </Text>

                {models.length === 0 ? (
                  <View style={s.emptyState}>
                    <Text style={s.emptyStateIcon}>🏍️</Text>
                    <Text style={s.emptyStateText}>No models available yet.</Text>
                  </View>
                ) : (
                  <View style={s.modelGrid}>
                    {models.map((m) => {
                      const isSelected = selectedModelId === m.id;

                      return (
                        <TouchableOpacity
                          key={m.id}
                          style={[
                            s.modelCard,
                            isSelected && s.modelCardActive,
                          ]}
                          onPress={() => {
                            setSelectedModelId(m.id);
                            resetDownstream();
                          }}
                          activeOpacity={0.75}
                        >
                          {m.reference_photo_url ? (
                            <Image
                              source={{ uri: m.reference_photo_url }}
                              style={s.modelCardImage}
                              resizeMode="cover"
                            />
                          ) : (
                            <View
                              style={[
                                s.modelCardImage,
                                s.modelCardImagePlaceholder,
                              ]}
                            >
                              <Text style={s.modelCardPlaceholderIcon}>🏍️</Text>
                            </View>
                          )}

                          <View style={s.modelCardBody}>
                            <Text
                              style={[
                                s.modelCardMake,
                                isSelected && s.modelCardMakeActive,
                              ]}
                              numberOfLines={1}
                            >
                              {m.make}
                            </Text>
                            <Text
                              style={[
                                s.modelCardModel,
                                isSelected && s.modelCardModelActive,
                              ]}
                              numberOfLines={1}
                            >
                              {m.model}
                            </Text>
                          </View>

                          {isSelected && (
                            <View style={s.modelCardCheck}>
                              <Text style={s.modelCardCheckText}>✓</Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {step === 3 && (
          <View>
            <View style={s.rowBetween}>
              <View>
                <Text style={s.title}>Select Parts</Text>
                <Text style={s.subtitle}>
  Up to {MAX_PREVIEW_PARTS} parts, one per category.
</Text>
              </View>

<Text
  style={[
    s.badge,
    selectedParts.length >= MAX_PREVIEW_PARTS && s.badgeActive,
  ]}
>
  {selectedParts.length}/{MAX_PREVIEW_PARTS}
</Text>
            </View>

            <TextInput
              style={[s.input, { marginBottom: 12 }]}
              placeholder="Search parts..."
              placeholderTextColor={theme.textMuted}
              value={partSearch}
              onChangeText={setPartSearch}
            />

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 16 }}
            >
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    s.catChip,
                    partCategory === cat && s.catChipActive,
                  ]}
                  onPress={() => setPartCategory(cat)}
                >
                  <Text
                    style={[
                      s.catChipText,
                      partCategory === cat && s.catChipTextActive,
                    ]}
                  >
                    {cat === 'all' ? 'All' : cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {filteredParts.length === 0 ? (
              <Text style={s.emptyText}>No matching parts found.</Text>
            ) : (
              filteredParts.map((part) => {
                const isSelected = selectedParts.includes(part.id);

                const selectedCategories = parts
                  .filter((p) => selectedParts.includes(p.id) && p.id !== part.id)
                  .map((p) => p.category);

                const isCategoryDisabled =
                  part.category && selectedCategories.includes(part.category);

                const isLimitDisabled =
  !isSelected && selectedParts.length >= MAX_PREVIEW_PARTS;

                const isDisabled =
                  !isSelected && (isLimitDisabled || isCategoryDisabled);

                return (
                  <TouchableOpacity
                    key={part.id}
                    style={[
                      s.partRow,
                      isSelected && s.partRowSelected,
                      isDisabled && s.partRowDisabled,
                    ]}
                    onPress={() => !isDisabled && togglePart(part.id)}
                    disabled={Boolean(isDisabled)}
                  >
                    {part.image_url ? (
                      <Image source={{ uri: part.image_url }} style={s.partImage} />
                    ) : (
                      <View style={[s.partImage, s.partImagePlaceholder]}>
                        <Text style={s.partImagePlaceholderText}>⚙️</Text>
                      </View>
                    )}

                    <View style={{ flex: 1 }}>
                      <Text
                        style={[s.partName, isDisabled && { opacity: 0.4 }]}
                      >
                        {part.name}
                      </Text>
                      <Text style={s.partCat}>{part.category || 'Part'}</Text>
                    </View>

                    <Text style={s.partPrice}>₱{part.price}</Text>

                    {isSelected && (
                      <Text style={{ color: theme.primary, marginLeft: 8 }}>✓</Text>
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}

        {step === 4 && (
          <View>
            <Text style={s.title}>Preview & Generate</Text>
            <Text style={s.subtitle}>
              Review your build before generating the AI preview.
            </Text>

            <View style={s.aiConsentNotice}>
              <Text style={s.aiConsentTitle}>AI Preview Notice</Text>
              <Text style={s.aiConsentText}>
                Before generation, you will be asked to consent to AI photo
                processing. The result is only a visual preview and may not
                perfectly match the actual installation.
              </Text>
            </View>

            {!!error && (
              <View style={s.errorBox}>
                <Text style={s.errorText}>{error}</Text>
              </View>
            )}

            {!resultImage && !loading && (
              <View style={s.card}>
                <Text style={s.sectionLabel}>Configuration Summary</Text>

                <Text style={[s.partName, { marginBottom: 4 }]}>
                  {motorcycleLabel || 'Custom Build'}
                </Text>

                <Text style={[s.partCat, { marginBottom: 12 }]}>
                  Source:{' '}
                  {imageSource === 'own' ? 'User Uploaded' : 'Catalog Reference'}
                </Text>

                <Text style={s.sectionLabel}>Selected Components</Text>

                {parts
                  .filter((p) => selectedParts.includes(p.id))
                  .map((p) => (
                    <View key={p.id} style={s.rowBetween}>
                      <Text style={s.partName}>• {p.name}</Text>
                      <Text style={{ color: theme.accent }}>₱{p.price}</Text>
                    </View>
                  ))}

                <View
                  style={[
                    s.rowBetween,
                    {
                      borderTopWidth: 1,
                      borderTopColor: theme.border,
                      marginTop: 12,
                      paddingTop: 12,
                    },
                  ]}
                >
                  <Text style={{ color: theme.text, fontWeight: 'bold' }}>
                    Total Estimate
                  </Text>

                  <Text style={{ color: theme.accent, fontWeight: 'bold' }}>
                    ₱
                    {parts
                      .filter((p) => selectedParts.includes(p.id))
                      .reduce((sum, p) => sum + parseFloat(p.price), 0)
                      .toFixed(2)}
                  </Text>
                </View>
              </View>
            )}

            {loading && (
              <View style={s.resultBox}>
                <ActivityIndicator size="large" color={theme.primaryLight} />
                <Text style={[s.emptyText, { marginTop: 16 }]}>
                  Generating… this may take 1–3 minutes
                </Text>
              </View>
            )}

            {resultImage && !loading && (
              <View style={s.card}>
                <Text style={s.sectionLabel}>✨ Render Finished</Text>

                <TouchableOpacity
                  style={s.resultImageButton}
                  onPress={() => setImagePreviewOpen(true)}
                  activeOpacity={0.9}
                >
                  <Image
                    source={{ uri: resultImage }}
                    style={s.resultImage}
                    resizeMode="contain"
                  />

                  <View style={s.resultImageOverlay}>
                    <Text style={s.resultImageOverlayText}>
                      🔍 Tap to view full image
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    s.generateBtn,
                    { marginTop: 16, backgroundColor: theme.bg3 },
                  ]}
                  onPress={() => {
                    setImagePreviewOpen(false);
                    setResultImage(null);
                    setSelectedParts([]);
                    setStep(1);
                  }}
                >
                  <Text style={[s.generateBtnText, { color: theme.text }]}>
                    🔄 Design New Configuration
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <View style={s.footer}>
        {step > 1 && (
          <TouchableOpacity
            style={s.backBtn}
            onPress={() => setStep(step - 1)}
            disabled={Boolean(loading)}
          >
            <Text style={s.backBtnText}>← Back</Text>
          </TouchableOpacity>
        )}

        {step < 4 ? (
          <TouchableOpacity
            style={[
              s.nextBtn,
              step === 1 && !imageSource && s.nextBtnDisabled,
            ]}
            onPress={() => {
              if (step === 1 && !imageSource) {
                Alert.alert('Selection Required', 'Please pick a photo source.');
                return;
              }

              if (step === 2 && imageSource === 'own' && !ownPhotoUri) {
                Alert.alert('Image Required', 'Please take or upload a motorcycle photo.');
                return;
              }

              if (step === 2 && imageSource === 'reference' && !selectedModelId) {
                Alert.alert('Selection Required', 'Please select a motorcycle model.');
                return;
              }

              if (step === 3 && selectedParts.length === 0) {
                Alert.alert('Nothing selected', 'Please select at least 1 part.');
                return;
              }

              setStep(step + 1);
            }}
          >
            <Text style={s.nextBtnText}>Next →</Text>
          </TouchableOpacity>
        ) : (
          !resultImage && (
            <TouchableOpacity
              style={[s.nextBtn, loading && s.nextBtnDisabled]}
              onPress={handleGenerate}
              disabled={Boolean(loading)}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.nextBtnText}>✨ Generate Preview</Text>
              )}
            </TouchableOpacity>
          )
        )}
      </View>

      <Modal
        visible={Boolean(imagePreviewOpen && resultImage)}
        transparent
        animationType="fade"
        onRequestClose={() => setImagePreviewOpen(false)}
      >
        <View style={s.imageModalBackdrop}>
          <TouchableOpacity
            style={s.imageModalClose}
            onPress={() => setImagePreviewOpen(false)}
            activeOpacity={0.8}
          >
            <Text style={s.imageModalCloseText}>✕</Text>
          </TouchableOpacity>

          <Image
            source={{ uri: resultImage }}
            style={s.imageModalImage}
            resizeMode="contain"
          />

          <Text style={s.imageModalHint}>AI Generated Preview</Text>
        </View>
      </Modal>
    </View>
  );
}

const styles = (theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },

    progressBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      backgroundColor: theme.bg2,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    progressStep: { flexDirection: 'row', alignItems: 'center' },
    progressDot: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: theme.bg3,
      borderWidth: 2,
      borderColor: theme.border,
      justifyContent: 'center',
      alignItems: 'center',
    },
    progressDotActive: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    progressNum: {
      color: theme.textMuted,
      fontWeight: 'bold',
      fontSize: 13,
    },
    progressNumActive: { color: '#fff' },
    progressLine: { width: 40, height: 2, backgroundColor: theme.border },
    progressLineActive: { backgroundColor: theme.primary },

    scrollContainer: { flex: 1 },
    content: { padding: 16, paddingBottom: 30 },

    title: {
      fontSize: 22,
      fontWeight: 'bold',
      color: theme.text,
      marginBottom: 4,
    },
    subtitle: {
      fontSize: 13,
      color: theme.textSub,
      marginBottom: 20,
    },
    sectionLabel: {
      fontSize: 11,
      fontWeight: 'bold',
      color: theme.textSub,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 10,
      marginTop: 4,
    },

    aiConsentNotice: {
      backgroundColor: theme.bg2,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      padding: 12,
      marginBottom: 14,
    },
    aiConsentTitle: {
      color: theme.text,
      fontWeight: '900',
      fontSize: 13,
      marginBottom: 4,
    },
    aiConsentText: {
      color: theme.textSub,
      fontSize: 12,
      lineHeight: 18,
    },

    errorBox: {
      backgroundColor: '#7f1d1d22',
      borderWidth: 1,
      borderColor: '#ef4444',
      borderRadius: 10,
      padding: 12,
      marginBottom: 16,
    },
    errorText: { color: '#ef4444', fontSize: 13 },

    rowBetween: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },

    sourceCard: {
      backgroundColor: theme.card,
      borderRadius: 16,
      padding: 24,
      borderWidth: 2,
      borderColor: theme.border,
      alignItems: 'center',
      marginBottom: 14,
    },
    sourceCardActive: {
      borderColor: theme.primary,
      backgroundColor: theme.primary + '12',
    },
    sourceIcon: { fontSize: 48, marginBottom: 12 },
    sourceTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: theme.text,
      marginBottom: 8,
    },
    sourceTextActive: { color: theme.primaryLight },
    sourceDesc: {
      fontSize: 13,
      color: theme.textMuted,
      textAlign: 'center',
      lineHeight: 19,
    },
    sourceCheck: {
      marginTop: 16,
      paddingHorizontal: 16,
      paddingVertical: 6,
      backgroundColor: theme.primary,
      borderRadius: 20,
    },
    sourceCheckText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },

    card: {
      backgroundColor: theme.card,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 16,
    },

    photoPicker: {
      width: '100%',
      height: 220,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: theme.border,
      borderStyle: 'dashed',
      backgroundColor: theme.bg2,
      overflow: 'hidden',
      marginBottom: 16,
      justifyContent: 'center',
      alignItems: 'center',
    },
    photoPickerFilled: {
      borderStyle: 'solid',
      borderColor: theme.primary + '66',
    },
    photoPickerImage: { width: '100%', height: '100%' },
    photoPickerOverlay: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: 'rgba(0,0,0,0.45)',
      paddingVertical: 10,
      alignItems: 'center',
    },
    photoPickerOverlayText: {
      color: '#fff',
      fontWeight: 'bold',
      fontSize: 14,
    },

    photoActionRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 16,
    },
    photoActionBtn: {
      flex: 1,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 14,
      padding: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    photoActionIcon: {
      fontSize: 26,
      marginBottom: 6,
    },
    photoActionTitle: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '800',
      marginBottom: 2,
      textAlign: 'center',
    },
    photoActionSub: {
      color: theme.textMuted,
      fontSize: 11,
      textAlign: 'center',
    },

    photoPickerEmpty: { alignItems: 'center', padding: 24 },
    photoPickerEmptyIcon: { fontSize: 52, marginBottom: 12 },
    photoPickerEmptyTitle: {
      fontSize: 16,
      fontWeight: 'bold',
      color: theme.text,
      marginBottom: 6,
    },
    photoPickerEmptyHint: { fontSize: 12, color: theme.textMuted },

    tipsCard: {
      backgroundColor: theme.bg2,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
      marginBottom: 20,
    },
    tipsTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.text,
      marginBottom: 10,
    },
    tipRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 6,
    },
    tipDot: {
      color: theme.primary,
      fontWeight: 'bold',
      fontSize: 16,
      marginRight: 8,
      lineHeight: 18,
    },
    tipText: {
      flex: 1,
      fontSize: 13,
      color: theme.textSub,
      lineHeight: 18,
    },

    optionalLabel: {
      fontSize: 11,
      fontWeight: 'normal',
      color: theme.textMuted,
      textTransform: 'none',
    },
    inputRow: { flexDirection: 'row', marginBottom: 12 },

    input: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      padding: 12,
      marginBottom: 12,
      fontSize: 14,
      color: theme.text,
      backgroundColor: theme.bg2,
    },

    modelGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    modelCard: {
      width: '47%',
      backgroundColor: theme.bg2,
      borderRadius: 14,
      borderWidth: 2,
      borderColor: theme.border,
      overflow: 'hidden',
    },
    modelCardActive: {
      borderColor: theme.primary,
      backgroundColor: theme.primary + '0D',
    },
    modelCardImage: {
      width: '100%',
      height: 110,
      backgroundColor: theme.bg3,
    },
    modelCardImagePlaceholder: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    modelCardPlaceholderIcon: { fontSize: 36 },
    modelCardBody: { padding: 10 },
    modelCardMake: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginBottom: 2,
    },
    modelCardMakeActive: { color: theme.primaryLight },
    modelCardModel: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.text,
    },
    modelCardModelActive: { color: theme.primaryLight },
    modelCardCheck: {
      position: 'absolute',
      top: 8,
      right: 8,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: theme.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    modelCardCheckText: {
      color: '#fff',
      fontSize: 11,
      fontWeight: 'bold',
    },

    emptyState: { alignItems: 'center', paddingVertical: 48 },
    emptyStateIcon: { fontSize: 48, marginBottom: 12 },
    emptyStateText: { color: theme.textMuted, fontSize: 14 },

    badge: {
      fontSize: 12,
      color: theme.textMuted,
      backgroundColor: theme.bg2,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 20,
      overflow: 'hidden',
    },
    badgeActive: {
      color: theme.primaryLight,
      backgroundColor: theme.primary + '22',
    },

    catChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: theme.bg2,
      borderWidth: 1,
      borderColor: theme.border,
      marginRight: 8,
    },
    catChipActive: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    catChipText: {
      color: theme.textSub,
      fontSize: 12,
      textTransform: 'capitalize',
    },
    catChipTextActive: { color: '#fff', fontWeight: 'bold' },

    partRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 8,
      backgroundColor: theme.bg2,
    },
    partRowSelected: {
      borderColor: theme.primary,
      backgroundColor: theme.primary + '08',
    },
    partRowDisabled: { opacity: 0.3 },
    partImage: {
      width: 46,
      height: 46,
      borderRadius: 8,
      marginRight: 12,
    },
    partImagePlaceholder: {
      backgroundColor: theme.bg3,
      justifyContent: 'center',
      alignItems: 'center',
    },
    partImagePlaceholderText: { fontSize: 20 },
    partName: { fontSize: 14, fontWeight: '600', color: theme.text },
    partCat: {
      fontSize: 12,
      color: theme.textMuted,
      textTransform: 'capitalize',
    },
    partPrice: { color: theme.accent, fontWeight: 'bold', fontSize: 14 },

    generateBtn: {
      backgroundColor: theme.primary,
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
    },
    generateBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
    resultBox: { alignItems: 'center', padding: 32 },
    resultImageButton: {
      width: '100%',
      height: 260,
      borderRadius: 12,
      overflow: 'hidden',
      backgroundColor: theme.bg2,
      borderWidth: 1,
      borderColor: theme.border,
    },
    resultImage: {
      width: '100%',
      height: '100%',
    },
    resultImageOverlay: {
      position: 'absolute',
      left: 10,
      right: 10,
      bottom: 10,
      alignItems: 'center',
    },
    resultImageOverlayText: {
      color: '#fff',
      backgroundColor: 'rgba(0,0,0,0.65)',
      borderRadius: 999,
      overflow: 'hidden',
      paddingHorizontal: 12,
      paddingVertical: 6,
      fontSize: 12,
      fontWeight: '800',
    },
    imageModalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.94)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 48,
    },
    imageModalClose: {
      position: 'absolute',
      top: 42,
      right: 20,
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: 'rgba(255,255,255,0.16)',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 2,
    },
    imageModalCloseText: {
      color: '#fff',
      fontSize: 24,
      fontWeight: '900',
      lineHeight: 26,
    },
    imageModalImage: {
      width: '100%',
      height: '82%',
    },
    imageModalHint: {
      color: '#fff',
      opacity: 0.8,
      fontSize: 13,
      fontWeight: '700',
      marginTop: 12,
      textAlign: 'center',
    },
    emptyText: {
      color: theme.textMuted,
      fontSize: 13,
      textAlign: 'center',
      marginVertical: 20,
    },

    footer: {
      flexDirection: 'row',
      padding: 16,
      gap: 12,
      backgroundColor: theme.bg2,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      alignItems: 'center',
    },
    backBtn: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    backBtnText: { color: theme.text, fontWeight: '600', fontSize: 15 },
    nextBtn: {
      flex: 2,
      backgroundColor: theme.primary,
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    nextBtnDisabled: { backgroundColor: theme.bg3, opacity: 0.5 },
    nextBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  });