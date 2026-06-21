import { useEffect, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, ActivityIndicator, Alert, TextInput, StatusBar
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';

export default function CustomizeScreen() {
  const { theme, isDark } = useTheme();
  const [step, setStep] = useState(1);

  // Step 1: source
  const [imageSource, setImageSource] = useState(''); // 'own' | 'reference'

  // Reference flow
  const [models, setModels] = useState([]);
  const [selectedModelId, setSelectedModelId] = useState('');

  // Own photo flow
  const [ownPhotoUri, setOwnPhotoUri] = useState(null);
  const [ownPhotoBase64, setOwnPhotoBase64] = useState(null);
  const [ownMake, setOwnMake] = useState('');
  const [ownModel, setOwnModel] = useState('');

  // Parts
  const [parts, setParts] = useState([]);
  const [selectedParts, setSelectedParts] = useState([]);
  const [partSearch, setPartSearch] = useState('');
  const [partCategory, setPartCategory] = useState('all');

  // Result
  const [resultImage, setResultImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [user, setUser] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
    fetchModels();
    fetchParts();
  }, []);

  async function fetchModels() {
    const { data } = await supabase.from('motorcycle_models').select('*').order('make');
    if (data) setModels(data);
  }

  async function fetchParts() {
    const { data } = await supabase.from('parts').select('*');
    if (data) setParts(data);
  }

  function resetDownstream() {
    setSelectedParts([]);
    setResultImage(null);
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

  function togglePart(partId) {
    const targetPart = parts.find((p) => p.id === partId);
    if (!targetPart) return;

    setSelectedParts((prev) => {
      if (prev.includes(partId)) return prev.filter((id) => id !== partId);

      const selectedPartDetails = parts.filter((p) => prev.includes(p.id));
      const categoryAlreadySelected = selectedPartDetails.some(
        (p) => p.category && p.category === targetPart.category
      );

      if (categoryAlreadySelected) {
        Alert.alert(
          'Category conflict',
          `You have already selected a part from the "${targetPart.category}" category.`
        );
        return prev;
      }

      if (prev.length >= 3) {
        Alert.alert('Limit reached', 'You can only select up to 3 parts for AI preview.');
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
    if (!term) return parts;
    return parts.filter((p) =>
      p.compatible_models?.some((cm) => cm.toLowerCase().includes(term))
    );
  }, [parts, motorcycleLabel]);

  const categories = ['all', ...new Set(compatibleParts.map((p) => p.category).filter(Boolean))];

  const filteredParts = compatibleParts.filter((p) => {
    const matchSearch = p.name.toLowerCase().includes(partSearch.toLowerCase());
    const matchCategory = partCategory === 'all' || p.category === partCategory;
    return matchSearch && matchCategory;
  });

  async function handleGenerate() {
    setError('');
    setLoading(true);
    setResultImage(null);

    try {
      let photoUrl;

      if (imageSource === 'reference') {
        photoUrl = selectedModel.reference_photo_url;
      } else {
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

      const selectedPartDetails = parts.filter((p) => selectedParts.includes(p.id));
      const partNames = selectedPartDetails.map((p) => p.name).join(', ');

      const { data: fnData, error: fnError } = await supabase.functions.invoke(
        'generate-preview',
        {
          body: {
            photoUrl,
            partNames,
            partDetails: selectedPartDetails,
            motorcycleLabel: motorcycleLabel || 'Customer motorcycle',
            imageSource,
          },
        }
      );

      if (fnError) throw fnError;
      setResultImage(fnData.imageUrl);

      await supabase.from('customizations').insert({
        customer_id: user.id,
        part_ids: selectedParts,
        original_photo_url: photoUrl,
        preview_image_url: null,
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
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.bg} />

      {/* Progress Wizard */}
      <View style={s.progressBar}>
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={s.progressStep}>
            <View style={[s.progressDot, step >= i && s.progressDotActive]}>
              <Text style={[s.progressNum, step >= i && s.progressNumActive]}>{i}</Text>
            </View>
            {i < 4 && <View style={[s.progressLine, step > i && s.progressLineActive]} />}
          </View>
        ))}
      </View>

      {/* Primary Scroll View Content Container */}
      <ScrollView style={s.scrollContainer} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        
        {/* Step 1: Source */}
        {step === 1 && (
          <View>
            <Text style={s.title}>Choose Photo Source</Text>
            <Text style={s.subtitle}>Select how you want to provide your base motorcycle photo.</Text>
            
            <View style={s.row}>
              <TouchableOpacity
                style={[s.sourceCard, imageSource === 'own' && s.sourceCardActive]}
                onPress={() => chooseSource('own')}
              >
                <Text style={s.sourceIcon}>📤</Text>
                <Text style={[s.sourceTitle, imageSource === 'own' && s.sourceTextActive]}>My Photo</Text>
                <Text style={s.sourceDesc}>Upload your own motorcycle photo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.sourceCard, imageSource === 'reference' && s.sourceCardActive]}
                onPress={() => chooseSource('reference')}
              >
                <Text style={s.sourceIcon}>🏍️</Text>
                <Text style={[s.sourceTitle, imageSource === 'reference' && s.sourceTextActive]}>Our Models</Text>
                <Text style={s.sourceDesc}>Choose from our reference photos</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Step 2: Source Verification & Image Prep */}
        {step === 2 && (
          <View>
            {imageSource === 'own' ? (
              <View>
                <Text style={s.title}>Upload Your Photo</Text>
                <Text style={s.subtitle}>Take a crisp side profile image of your ride.</Text>
                
                <TouchableOpacity style={s.uploadBtn} onPress={pickImage}>
                  <Text style={s.uploadBtnText}>
                    {ownPhotoUri ? '📷 Change Photo' : '📷 Pick from Library'}
                  </Text>
                </TouchableOpacity>
                {ownPhotoUri && (
                  <Image source={{ uri: ownPhotoUri }} style={s.previewImage} resizeMode="cover" />
                )}
                <Text style={s.sectionLabel}>Brand details</Text>
                <TextInput
                  style={s.input}
                  placeholder="Make (optional, e.g. Honda)"
                  placeholderTextColor={theme.textMuted}
                  value={ownMake}
                  onChangeText={setOwnMake}
                />
                <TextInput
                  style={s.input}
                  placeholder="Model (optional, e.g. Click 125i)"
                  placeholderTextColor={theme.textMuted}
                  value={ownModel}
                  onChangeText={setOwnModel}
                />
              </View>
            ) : (
              <View>
                <Text style={s.title}>Select Motorcycle Model</Text>
                <Text style={s.subtitle}>Select from our verified structural baselines.</Text>
                
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                  {models.map((m) => (
                    <TouchableOpacity
                      key={m.id}
                      style={[s.modelChip, selectedModelId === m.id && s.modelChipActive]}
                      onPress={() => { setSelectedModelId(m.id); resetDownstream(); }}
                    >
                      <Text style={[s.modelChipText, selectedModelId === m.id && s.modelChipTextActive]}>
                        {m.make} {m.model}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                {selectedModel?.reference_photo_url && (
                  <Image
                    source={{ uri: selectedModel.reference_photo_url }}
                    style={s.previewImage}
                    resizeMode="cover"
                  />
                )}
              </View>
            )}
          </View>
        )}

        {/* Step 3: Accessory/Parts Selection */}
        {step === 3 && (
          <View>
            <View style={s.rowBetween}>
              <View>
                <Text style={s.title}>Select Parts</Text>
                <Text style={s.subtitle}>Choose elements you want the rendering engine to mount.</Text>
              </View>
              <Text style={[s.badge, selectedParts.length >= 3 && s.badgeActive]}>
                {selectedParts.length}/3
              </Text>
            </View>

            <TextInput
              style={[s.input, { marginBottom: 12 }]}
              placeholder="Search parts..."
              placeholderTextColor={theme.textMuted}
              value={partSearch}
              onChangeText={setPartSearch}
            />

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[s.catChip, partCategory === cat && s.catChipActive]}
                  onPress={() => setPartCategory(cat)}
                >
                  <Text style={[s.catChipText, partCategory === cat && s.catChipTextActive]}>
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

                const isCategoryDisabled = part.category && selectedCategories.includes(part.category);
                const isLimitDisabled = !isSelected && selectedParts.length >= 3;
                const isDisabled = !isSelected && (isLimitDisabled || isCategoryDisabled);

                return (
                  <TouchableOpacity
                    key={part.id}
                    style={[s.partRow, isSelected && s.partRowSelected, isDisabled && s.partRowDisabled]}
                    onPress={() => !isDisabled && togglePart(part.id)}
                    disabled={isDisabled}
                  >
                    {part.image_url ? (
                      <Image source={{ uri: part.image_url }} style={s.partImage} />
                    ) : (
                      <View style={[s.partImage, s.partImagePlaceholder]}>
                        <Text>⚙️</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={[s.partName, isDisabled && { opacity: 0.4 }]}>{part.name}</Text>
                      <Text style={s.partCat}>{part.category || 'Part'}</Text>
                    </View>
                    <Text style={s.partPrice}>₱{part.price}</Text>
                    {isSelected && <Text style={{ color: theme.primary, marginLeft: 8 }}>✓</Text>}
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}

        {/* Step 4: Final Generation Trigger and Preview Screen */}
        {step === 4 && (
          <View>
            <Text style={s.title}>Preview & Generation</Text>
            <Text style={s.subtitle}>Review your baseline assembly profile before calling AI models.</Text>

            {!!error && <View style={s.errorBox}><Text style={s.errorText}>{error}</Text></View>}

            {!resultImage && !loading && (
              <View style={s.card}>
                <Text style={s.sectionLabel}>Configuration Summary</Text>
                <Text style={[s.partName, { marginBottom: 4 }]}>Target Profile: {motorcycleLabel || 'Custom Build'}</Text>
                <Text style={[s.partCat, { marginBottom: 12 }]}>Source Method: {imageSource === 'own' ? 'User Uploaded' : 'Catalog Reference'}</Text>
                
                <Text style={s.sectionLabel}>Selected Components</Text>
                {parts.filter((p) => selectedParts.includes(p.id)).map((p) => (
                  <View key={p.id} style={s.rowBetween}>
                    <Text style={s.partName}>• {p.name}</Text>
                    <Text style={{ color: theme.accent }}>₱{p.price}</Text>
                  </View>
                ))}
                
                <View style={[s.rowBetween, { borderTopWidth: 1, borderTopColor: theme.border, marginTop: 12, paddingTop: 12 }]}>
                  <Text style={{ color: theme.text, fontWeight: 'bold' }}>Total Structural Estimate</Text>
                  <Text style={{ color: theme.accent, fontWeight: 'bold' }}>
                    ₱{parts.filter((p) => selectedParts.includes(p.id)).reduce((sum, p) => sum + parseFloat(p.price), 0).toFixed(2)}
                  </Text>
                </View>
              </View>
            )}

            {loading && (
              <View style={s.resultBox}>
                <ActivityIndicator size="large" color={theme.primaryLight} />
                <Text style={[s.emptyText, { marginTop: 16 }]}>Generating preview… this may take 1 to 3 minutes</Text>
              </View>
            )}

            {resultImage && !loading && (
              <View style={s.card}>
                <Text style={s.sectionLabel}>✨ Render Finished</Text>
                <Image source={{ uri: resultImage }} style={s.resultImage} resizeMode="contain" />
                
                <TouchableOpacity
                  style={[s.generateBtn, { marginTop: 16, backgroundColor: theme.bg3 }]}
                  onPress={() => { setResultImage(null); setSelectedParts([]); setStep(1); }}
                >
                  <Text style={[s.generateBtnText, { color: theme.text }]}>🔄 Design New Configuration</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

      </ScrollView>

      {/* Fixed Layout Action Control Footer */}
      <View style={s.footer}>
        {step > 1 && (
          <TouchableOpacity style={s.backBtn} onPress={() => setStep(step - 1)} disabled={loading}>
            <Text style={s.backBtnText}>← Back</Text>
          </TouchableOpacity>
        )}
        
        {step < 4 ? (
          <TouchableOpacity
            style={[s.nextBtn, step === 1 && !imageSource && s.nextBtnDisabled]}
            onPress={() => {
              if (step === 1 && !imageSource) {
                Alert.alert('Selection Required', 'Please pick a file entry source route.');
                return;
              }
              if (step === 2 && imageSource === 'own' && !ownPhotoUri) {
                Alert.alert('Image Required', 'Please pick a snapshot variant from your device gallery.');
                return;
              }
              if (step === 2 && imageSource === 'reference' && !selectedModelId) {
                Alert.alert('Selection Required', 'Please select a production motorcycle asset.');
                return;
              }
              if (step === 3 && selectedParts.length === 0) {
                Alert.alert('Configuration Empty', 'Please bundle at least 1 hardware component variant.');
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
              disabled={loading}
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
    </View>
  );
}

const styles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  progressBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: theme.bg2, borderBottomWidth: 1, borderBottomColor: theme.border },
  progressStep: { flexDirection: 'row', alignItems: 'center' },
  progressDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: theme.bg3, borderWidth: 2, borderColor: theme.border, justifyContent: 'center', alignItems: 'center' },
  progressDotActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  progressNum: { color: theme.textMuted, fontWeight: 'bold', fontSize: 13 },
  progressNumActive: { color: '#fff' },
  progressLine: { width: 40, height: 2, backgroundColor: theme.border },
  progressLineActive: { backgroundColor: theme.primary },
  scrollContainer: { flex: 1 },
  content: { padding: 16, paddingBottom: 30 },
  title: { fontSize: 22, fontWeight: 'bold', color: theme.text, marginBottom: 4 },
  subtitle: { fontSize: 13, color: theme.textSub, marginBottom: 20 },
  sectionLabel: { fontSize: 11, fontWeight: 'bold', color: theme.textSub, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 4 },
  errorBox: { backgroundColor: '#7f1d1d22', borderWidth: 1, borderColor: '#ef4444', borderRadius: 10, padding: 12, marginBottom: 16 },
  errorText: { color: '#ef4444', fontSize: 13 },
  row: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sourceCard: { flex: 1, backgroundColor: theme.card, borderRadius: 12, padding: 14, borderWidth: 2, borderColor: theme.border, alignItems: 'center' },
  sourceCardActive: { borderColor: theme.primary, backgroundColor: theme.primary + '15' },
  sourceIcon: { fontSize: 28, marginBottom: 6 },
  sourceTitle: { fontSize: 14, fontWeight: 'bold', color: theme.text, marginBottom: 4 },
  sourceTextActive: { color: theme.primaryLight },
  sourceDesc: { fontSize: 11, color: theme.textMuted, textAlign: 'center' },
  card: { backgroundColor: theme.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.border, marginBottom: 16 },
  uploadBtn: { backgroundColor: theme.primary, borderRadius: 10, padding: 12, alignItems: 'center', marginBottom: 12 },
  uploadBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  previewImage: { width: '100%', height: 180, borderRadius: 10, marginBottom: 16 },
  input: { borderWidth: 1, borderColor: theme.border, borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 14, color: theme.text, backgroundColor: theme.bg2 },
  modelChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border, marginRight: 8 },
  modelChipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  modelChipText: { color: theme.textSub, fontSize: 13 },
  modelChipTextActive: { color: '#fff', fontWeight: 'bold' },
  badge: { fontSize: 12, color: theme.textMuted, backgroundColor: theme.bg2, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, overflow: 'hidden' },
  badgeActive: { color: theme.primaryLight, backgroundColor: theme.primary + '22' },
  catChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border, marginRight: 8 },
  catChipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  catChipText: { color: theme.textSub, fontSize: 12, textTransform: 'capitalize' },
  catChipTextActive: { color: '#fff', fontWeight: 'bold' },
  partRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: theme.border, marginBottom: 8, backgroundColor: theme.bg2 },
  partRowSelected: { borderColor: theme.primary, backgroundColor: theme.primary + '08' },
  partRowDisabled: { opacity: 0.3 },
  partImage: { width: 46, height: 46, borderRadius: 8, marginRight: 12 },
  partImagePlaceholder: { backgroundColor: theme.bg3, justifyContent: 'center', alignItems: 'center' },
  partName: { fontSize: 14, fontWeight: '600', color: theme.text },
  partCat: { fontSize: 12, color: theme.textMuted, textTransform: 'capitalize' },
  partPrice: { color: theme.accent, fontWeight: 'bold', fontSize: 14 },
  generateBtn: { backgroundColor: theme.primary, borderRadius: 12, padding: 16, alignItems: 'center' },
  generateBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  resultBox: { alignItems: 'center', padding: 32 },
  resultImage: { width: '100%', height: 260, borderRadius: 12 },
  emptyText: { color: theme.textMuted, fontSize: 13, textAlign: 'center', marginVertical: 20 },
  footer: { flexDirection: 'row', padding: 16, gap: 12, backgroundColor: theme.bg2, borderTopWidth: 1, borderTopColor: theme.border, alignItems: 'center' },
  backBtn: { flex: 1, borderWidth: 1, borderColor: theme.border, borderRadius: 12, padding: 16, alignItems: 'center', justifyContent: 'center' },
  backBtnText: { color: theme.text, fontWeight: '600', fontSize: 15 },
  nextBtn: { flex: 2, backgroundColor: theme.primary, borderRadius: 12, padding: 16, alignItems: 'center', justifyContent: 'center' },
  nextBtnDisabled: { backgroundColor: theme.bg3, opacity: 0.5 },
  nextBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});