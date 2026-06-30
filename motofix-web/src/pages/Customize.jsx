import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { supabase } from '../lib/supabaseClient';
import {
  CONSENT_SOURCE_PAGES,
  CONSENT_TYPES,
  acceptCustomerConsent,
  getConsentDefinitionSafe,
} from '../lib/consents';

const MAX_PREVIEW_PARTS = 3;

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

function formatPartList(parts) {
  return parts.map((part) => part.name).join(', ');
}

function inferInstallArea(part) {
  const text = [
    part.name,
    part.category,
    part.description,
    part.prompt_description,
    part.install_area,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (
    text.includes('wheel') ||
    text.includes('wheels') ||
    text.includes('rim') ||
    text.includes('rims') ||
    text.includes('mags') ||
    text.includes('mag wheel')
  ) {
    return 'front and/or rear wheel/rim area only; replace the visible rim/spoke design, not just the color; preserve tire size, axle position, brake disc position, fork/swingarm position, and motorcycle stance';
  }

  if (
    text.includes('exhaust') ||
    text.includes('muffler') ||
    text.includes('pipe') ||
    text.includes('silencer')
  ) {
    return 'exhaust or muffler mounting area only; replace the exhaust body/pipe shape while preserving the side fairing, engine, frame, and body panels';
  }

  if (text.includes('seat') || text.includes('saddle')) {
    return 'seat area only; replace the seat silhouette, cushion shape, upholstery texture, stitching, and color while preserving the tail fairing, side panels, and frame';
  }

  if (
    text.includes('headlight') ||
    text.includes('head light') ||
    text.includes('lamp') ||
    text.includes('front light')
  ) {
    return 'front headlight housing and lens area only; preserve the front fairing, handlebar, fork, body color, and camera angle';
  }

  if (text.includes('mirror') || text.includes('side mirror')) {
    return 'left and/or right mirror area only; replace the mirror housing and stem while preserving the handlebar and controls';
  }

  if (
    text.includes('fairing') ||
    text.includes('body kit') ||
    text.includes('body panel') ||
    text.includes('cowling')
  ) {
    return 'matching body panel or fairing area only; preserve all unrelated panels, wheels, seat, background, and lighting';
  }

  if (
    text.includes('decal') ||
    text.includes('sticker') ||
    text.includes('graphics') ||
    text.includes('vinyl')
  ) {
    return 'body panel surface only; apply the selected decal/sticker artwork without changing the motorcycle body shape';
  }

  if (
    text.includes('handlebar') ||
    text.includes('handle bar') ||
    text.includes('bar end') ||
    text.includes('grip')
  ) {
    return 'handlebar area only; replace the handlebar shape/finish while preserving cables, controls, dashboard, and front fork';
  }

  if (
    text.includes('footpeg') ||
    text.includes('foot peg') ||
    text.includes('rearset') ||
    text.includes('rear set')
  ) {
    return 'footpeg or rearset area only; preserve the frame, side fairing, and engine area';
  }

  if (
    text.includes('brake') ||
    text.includes('disc') ||
    text.includes('rotor') ||
    text.includes('caliper')
  ) {
    return 'brake component area only; preserve wheel alignment, tire size, fork position, and motorcycle stance';
  }

  if (
    text.includes('shock') ||
    text.includes('suspension') ||
    text.includes('fork') ||
    text.includes('absorber')
  ) {
    return 'suspension or shock absorber area only; preserve frame geometry, wheel position, and motorcycle stance';
  }

  return (
    part.install_area ||
    'the exact normal mounting area for this selected motorcycle part'
  );
}

function buildPreviewPartDetails(parts) {
  return parts.map((part) => ({
    id: part.id,
    name: part.name,
    category: part.category || 'General',
    // image_url is still the normal shop/product image for display.
    image_url: part.image_url || '',
    // ai_reference_url is the clean single-part photo used by the Edge Function.
    // If it is empty, the Edge Function can fall back to image_url.
    ai_reference_url: part.ai_reference_url || part.image_url || '',
    prompt_description:
      part.prompt_description ||
      part.description ||
      `${part.name} motorcycle part. Replace the actual physical part shape and structure, not only the color.`,
    description: part.description || '',
    color: part.color || '',
    finish: part.finish || '',
    material: part.material || '',
    install_area: part.install_area || inferInstallArea(part),
  }));
}

function SourceCard({ active, icon, title, description, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group rounded-3xl border p-5 text-left transition hover:-translate-y-0.5 ${
        active
          ? 'border-primary-500 bg-primary-50 shadow-lg shadow-primary-600/10 dark:bg-primary-900/20'
          : 'border-gray-200 bg-white hover:border-primary-200 hover:bg-gray-50 dark:border-dark-700 dark:bg-dark-900/50 dark:hover:border-primary-500/30 dark:hover:bg-dark-900'
      }`}
    >
      <div
        className={`mb-4 grid h-12 w-12 place-items-center rounded-2xl text-2xl transition ${
          active
            ? 'bg-primary-600 text-white'
            : 'bg-gray-100 text-gray-700 group-hover:bg-primary-50 group-hover:text-primary-700 dark:bg-dark-800 dark:text-gray-300 dark:group-hover:bg-primary-900/25 dark:group-hover:text-primary-300'
        }`}
      >
        {icon}
      </div>
      <p className="text-sm font-black text-gray-950 dark:text-white">
        {title}
      </p>
      <p className="mt-2 text-xs leading-5 text-gray-600 dark:text-gray-400">
        {description}
      </p>
    </button>
  );
}

function StepHeader({ number, title, description }) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-2xl bg-primary-50 text-sm font-black text-primary-700 ring-1 ring-primary-100 dark:bg-primary-900/25 dark:text-primary-300 dark:ring-primary-500/20">
        {number}
      </div>
      <div>
        <h2 className="text-sm font-black uppercase tracking-wider text-gray-950 dark:text-white">
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}

function Notice({ type = 'info', children }) {
  const styles = {
    error:
      'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300',
    success:
      'border-green-200 bg-green-50 text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300',
    info:
      'border-primary-200 bg-primary-50 text-primary-700 dark:border-primary-500/30 dark:bg-primary-500/10 dark:text-primary-300',
  };

  return (
    <div
      className={`mb-4 rounded-2xl border p-4 text-sm font-semibold ${styles[type]}`}
    >
      {children}
    </div>
  );
}

export default function Customize() {
  const { user } = useAuth();
  const { addToCart } = useCart();

  const [imageSource, setImageSource] = useState('');

  const [models, setModels] = useState([]);
  const [selectedModelId, setSelectedModelId] = useState('');

  const [uploadedPhoto, setUploadedPhoto] = useState(null);
  const [uploadedPreview, setUploadedPreview] = useState(null);
  const [ownMake, setOwnMake] = useState('');
  const [ownModel, setOwnModel] = useState('');

  const [parts, setParts] = useState([]);
  const [selectedParts, setSelectedParts] = useState([]);
  const [partSearch, setPartSearch] = useState('');
  const [partCategory, setPartCategory] = useState('all');
  const [partMessage, setPartMessage] = useState('');

  const [resultImage, setResultImage] = useState(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState('');
  const [cartMessage, setCartMessage] = useState('');
  const [agreedToAiConsent, setAgreedToAiConsent] = useState(false);
  const [aiPhotoConsent, setAiPhotoConsent] = useState(null);
  const [consentLoading, setConsentLoading] = useState(true);

  useEffect(() => {
    fetchModels();
    fetchAllParts();

    const channel = supabase
      .channel('customize-parts-refresh')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'parts' },
        () => fetchAllParts(false)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadAiPhotoConsent() {
      try {
        const definition = await getConsentDefinitionSafe(
          CONSENT_TYPES.AI_PHOTO_PROCESSING
        );

        if (isMounted) setAiPhotoConsent(definition);
      } catch (error) {
        console.warn('Failed to load AI photo consent definition:', error);
      } finally {
        if (isMounted) setConsentLoading(false);
      }
    }

    loadAiPhotoConsent();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (uploadedPreview) URL.revokeObjectURL(uploadedPreview);
    };
  }, [uploadedPreview]);

  async function fetchModels() {
    const { data, error: fetchError } = await supabase
      .from('motorcycle_models')
      .select('*')
      .order('make', { ascending: true })
      .order('model', { ascending: true });

    if (fetchError) {
      console.error(fetchError);
      return;
    }

    if (data) setModels(data);
  }

  async function fetchAllParts(showLoader = true) {
    if (showLoader) setPageLoading(true);

    const { data, error: fetchError } = await supabase
      .from('parts')
      .select('*')
      .eq('is_active', true)
      .gt('stock_quantity', 0)
      .order('name', { ascending: true });

    if (fetchError) {
      console.error(fetchError);
      setPageLoading(false);
      return;
    }

    const previewableParts = (data || []).filter(
      (part) => part.is_previewable !== false
    );

    setParts(previewableParts);

    setPageLoading(false);
  }

  function resetDownstream() {
    setSelectedParts([]);
    setResultImage(null);
    setPartSearch('');
    setPartCategory('all');
    setError('');
    setPartMessage('');
    setLightboxOpen(false);
  }

  function chooseSource(source) {
    setImageSource(source);
    setSelectedModelId('');

    if (uploadedPreview) {
      URL.revokeObjectURL(uploadedPreview);
    }

    setUploadedPhoto(null);
    setUploadedPreview(null);
    setOwnMake('');
    setOwnModel('');
    setAgreedToAiConsent(false);
    resetDownstream();
  }

  function handlePhotoChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please upload a valid image file.');
      return;
    }

    if (uploadedPreview) {
      URL.revokeObjectURL(uploadedPreview);
    }

    setUploadedPhoto(file);
    setUploadedPreview(URL.createObjectURL(file));
    setResultImage(null);
    setAgreedToAiConsent(false);
    setError('');
  }

  function togglePart(partId) {
    const part = parts.find((item) => item.id === partId);
    if (!part) return;

    setSelectedParts((previous) => {
      if (previous.includes(partId)) {
        return previous.filter((id) => id !== partId);
      }

      const selectedPartObjects = previous
        .map((id) => parts.find((item) => item.id === id))
        .filter(Boolean);

      const existingInCategory = selectedPartObjects.find(
        (item) => (item.category || 'General') === (part.category || 'General')
      );

      const previousWithoutSameCategory = previous.filter((id) => {
        const item = parts.find((partItem) => partItem.id === id);
        return (item?.category || 'General') !== (part.category || 'General');
      });

      if (previousWithoutSameCategory.length >= MAX_PREVIEW_PARTS) {
        setPartMessage(
          `You can only preview up to ${MAX_PREVIEW_PARTS} parts at a time.`
        );
        setTimeout(() => setPartMessage(''), 2500);
        return previous;
      }

      if (existingInCategory) {
        setPartMessage(
          `Swapped "${existingInCategory.name}" for "${part.name}" — only 1 part per category.`
        );
        setTimeout(() => setPartMessage(''), 2500);
      }

      setResultImage(null);

      return [...previousWithoutSameCategory, partId];
    });
  }

  function handleAddToCart(part) {
    addToCart(part);
    setCartMessage(`${part.name} added to cart!`);
    setTimeout(() => setCartMessage(''), 2500);
  }

  const selectedModel = models.find(
    (model) => String(model.id) === String(selectedModelId)
  );

  const motorcycleLabel =
    imageSource === 'reference' && selectedModel
      ? `${selectedModel.make} ${selectedModel.model}`.trim()
      : imageSource === 'own'
      ? `${ownMake} ${ownModel}`.trim()
      : '';

  const compatibleParts = useMemo(() => {
    const term = normalizeText(motorcycleLabel);

    if (!term) return parts;

    return parts.filter((part) => {
      const compatibleModels = part.compatible_models || [];

      if (!Array.isArray(compatibleModels) || compatibleModels.length === 0) {
        return true;
      }

      return compatibleModels.some((model) => {
        const modelText = normalizeText(model);
        return modelText.includes(term) || term.includes(modelText);
      });
    });
  }, [parts, motorcycleLabel]);

  const categories = useMemo(() => {
    const counts = compatibleParts.reduce(
      (acc, part) => {
        const key = part.category || 'General';
        acc[key] = (acc[key] || 0) + 1;
        acc.all += 1;
        return acc;
      },
      { all: 0 }
    );

    const categoryNames = Object.keys(counts)
      .filter((name) => name !== 'all')
      .sort((a, b) => a.localeCompare(b));

    return [
      { name: 'all', count: counts.all },
      ...categoryNames.map((name) => ({ name, count: counts[name] })),
    ];
  }, [compatibleParts]);

  const filteredParts = useMemo(() => {
    const query = normalizeText(partSearch);

    return compatibleParts.filter((part) => {
      const searchable = [
        part.name,
        part.category,
        part.description,
        part.prompt_description,
        ...(part.compatible_models || []),
      ]
        .filter(Boolean)
        .join(' ');

      const matchSearch = !query || normalizeText(searchable).includes(query);
      const matchCategory =
        partCategory === 'all' || (part.category || 'General') === partCategory;

      return matchSearch && matchCategory;
    });
  }, [compatibleParts, partSearch, partCategory]);

  const selectedPartObjects = useMemo(
    () =>
      selectedParts
        .map((id) => parts.find((part) => part.id === id))
        .filter(Boolean),
    [selectedParts, parts]
  );

  const selectedCategories = useMemo(
    () => new Set(selectedPartObjects.map((part) => part.category || 'General')),
    [selectedPartObjects]
  );

  const totalEstimate = selectedPartObjects.reduce(
    (sum, part) => sum + (Number(part.price) || 0),
    0
  );

  const readyForParts =
    (imageSource === 'reference' && selectedModelId) ||
    (imageSource === 'own' && uploadedPhoto);

  async function handleGenerate() {
    setError('');

    if (!user?.id) {
      setError('Please log in before generating a preview.');
      return;
    }

    if (!imageSource) {
      setError('Please choose how you want to preview your motorcycle.');
      return;
    }

    if (imageSource === 'reference' && !selectedModelId) {
      setError('Please select your motorcycle model.');
      return;
    }

    if (imageSource === 'own' && !uploadedPhoto) {
      setError('Please upload a photo of your motorcycle.');
      return;
    }

    if (selectedParts.length === 0) {
      setError('Please select at least one part to preview.');
      return;
    }

    if (selectedParts.length > MAX_PREVIEW_PARTS) {
      setError(`Please select a maximum of ${MAX_PREVIEW_PARTS} parts.`);
      return;
    }

    if (!agreedToAiConsent) {
      setError('Please agree to the AI photo processing consent before generating a preview.');
      return;
    }

    setLoading(true);
    setResultImage(null);

    try {
      await acceptCustomerConsent({
        consentType: CONSENT_TYPES.AI_PHOTO_PROCESSING,
        sourcePage: CONSENT_SOURCE_PAGES.CUSTOMIZE,
        metadata: {
          image_source: imageSource,
          uploaded_own_photo: imageSource === 'own',
          selected_model_id: imageSource === 'reference' ? selectedModelId : null,
          motorcycle_label: motorcycleLabel || 'Customer motorcycle',
          selected_part_count: selectedParts.length,
          selected_part_ids: selectedParts,
          selected_part_names: selectedPartObjects.map((part) => part.name),
        },
      });

      let photoUrl;

      if (imageSource === 'reference') {
        // Use the exact same motorcycle photo shown on screen.
        // Do NOT use ai_reference_photo_url here because it can have a different body color.
        photoUrl = selectedModel?.reference_photo_url;

        if (!photoUrl) {
          throw new Error('This motorcycle model has no reference photo yet.');
        }
      } else {
        const fileExt = uploadedPhoto.name.split('.').pop() || 'jpg';
        const safeExt = fileExt.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
        const filePath = `${user.id}/${crypto.randomUUID()}.${safeExt}`;

        const { error: uploadError } = await supabase.storage
          .from('motorcycle-photos')
          .upload(filePath, uploadedPhoto, {
            contentType: uploadedPhoto.type,
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('motorcycle-photos')
          .getPublicUrl(filePath);

        photoUrl = urlData.publicUrl;
      }

      const selectedPartDetails = parts.filter((part) =>
        selectedParts.includes(part.id)
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

      const missingAiReferenceImages = selectedPartDetails.filter(
        (part) => !part.ai_reference_url && !part.image_url
      );

      if (missingAiReferenceImages.length > 0) {
        throw new Error(
          `These selected parts have no AI reference image: ${missingAiReferenceImages
            .map((part) => part.name)
            .join(
              ', '
            )}. Add an AI Reference URL or Image URL first so the AI can copy the actual shape.`
        );
      }

      const previewPartDetails = buildPreviewPartDetails(selectedPartDetails);
      const partNames = formatPartList(previewPartDetails);

      console.log('AI preview base photo URL:', photoUrl);
      console.log('AI preview displayed model photo URL:', selectedModel?.reference_photo_url || null);
      console.log('Sending AI preview parts:', previewPartDetails);

      const { data: fnData, error: fnError } = await supabase.functions.invoke(
        'generate-preview',
        {
          body: {
            photoUrl,
            partNames,
            partDetails: previewPartDetails,
            motorcycleLabel: motorcycleLabel || 'Customer motorcycle',
            imageSource,
            basePhotoSource:
              imageSource === 'reference'
                ? 'reference_photo_url_locked'
                : 'customer_uploaded_photo',
          },
        }
      );

      if (fnError) throw fnError;

      if (!fnData?.imageUrl) {
        throw new Error('The preview generator did not return an image URL.');
      }

      console.log('AI preview debug:', fnData.debug);

      const debugParts = fnData.debug?.selectedParts || [];
      const partsWithoutReference = debugParts.filter((part) => {
        if ('hasUsableReference' in part) return !part.hasUsableReference;
        return !part.hasAiReferenceUrl && !part.hasImageUrl;
      });

      if (partsWithoutReference.length > 0) {
        console.warn(
          'Some selected parts were sent without a usable AI reference:',
          partsWithoutReference
        );
      }

      setResultImage(fnData.imageUrl);

      const { error: saveError } = await supabase.from('customizations').insert({
        customer_id: user.id,
        part_ids: selectedParts,
        original_photo_url: photoUrl,
        preview_image_url: fnData.imageUrl,
        prompt_used: fnData.prompt || null,
        status: 'generated',
      });

      if (saveError) {
        console.error('Failed to save customization:', saveError);
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to generate preview. Please try again.');
    } finally {
      setLoading(false);
    }
  }

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
                  MotoFix AI Preview
                </p>
                <h1 className="text-3xl font-black tracking-tight text-gray-950 dark:text-white md:text-4xl">
                  AI Motorcycle Appearance Preview
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-400">
                  Upload your motorcycle or use a reference model, select up to{' '}
                  {MAX_PREVIEW_PARTS} parts, and generate a visual preview
                  before buying.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:flex">
                <div className="rounded-2xl bg-gray-50 px-4 py-3 text-center ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                  <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Selected
                  </p>
                  <p className="text-lg font-black text-primary-600 dark:text-primary-400">
                    {selectedParts.length}/{MAX_PREVIEW_PARTS}
                  </p>
                </div>
                <div className="rounded-2xl bg-gray-50 px-4 py-3 text-center ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                  <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Estimate
                  </p>
                  <p className="text-lg font-black text-accent-600 dark:text-accent-400">
                    {formatPeso(totalEstimate)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {error && <Notice type="error">⚠ {error}</Notice>}
        {cartMessage && <Notice type="success">🛒 {cartMessage}</Notice>}
        {partMessage && <Notice type="info">🔁 {partMessage}</Notice>}

        <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
          <div className="space-y-6">
            {/* Step 1 */}
            <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-700 dark:bg-dark-800">
              <StepHeader
                number={1}
                title="Choose Photo Source"
                description="Use your own motorcycle photo or choose a saved reference model."
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <SourceCard
                  active={imageSource === 'own'}
                  icon="📤"
                  title="Use My Own Photo"
                  description="Upload a picture of your actual motorcycle for a more personal preview."
                  onClick={() => chooseSource('own')}
                />
                <SourceCard
                  active={imageSource === 'reference'}
                  icon="🏍️"
                  title="Choose From Models"
                  description="Pick a model from your database and use its saved reference image."
                  onClick={() => chooseSource('reference')}
                />
              </div>
            </section>

            {/* Own photo */}
            {imageSource === 'own' && (
              <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-700 dark:bg-dark-800">
                <StepHeader
                  number={2}
                  title="Upload Your Photo"
                  description="A clear side photo works best for part visualization."
                />

                <label className="block cursor-pointer rounded-3xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center transition hover:border-primary-300 hover:bg-white dark:border-dark-700 dark:bg-dark-900/60 dark:hover:border-primary-500/40">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoChange}
                    className="hidden"
                  />
                  <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-primary-50 text-2xl text-primary-700 dark:bg-primary-900/25 dark:text-primary-300">
                    📷
                  </div>
                  <p className="text-sm font-black text-gray-950 dark:text-white">
                    Click to upload motorcycle photo
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    PNG, JPG, or WebP image
                  </p>
                </label>

                {uploadedPreview && (
                  <div className="mt-4 overflow-hidden rounded-3xl border border-gray-200 bg-gray-50 dark:border-dark-700 dark:bg-dark-900">
                    <img
                      src={uploadedPreview}
                      alt="Your motorcycle"
                      className="max-h-72 w-full object-contain"
                    />
                  </div>
                )}

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-600 dark:text-gray-400">
                      Make{' '}
                      <span className="font-medium normal-case text-gray-400">
                        (optional)
                      </span>
                    </label>
                    <input
                      type="text"
                      value={ownMake}
                      onChange={(event) => {
                        setOwnMake(event.target.value);
                        resetDownstream();
                      }}
                      placeholder="e.g. Honda"
                      className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:placeholder:text-gray-500 dark:focus:border-primary-500"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-600 dark:text-gray-400">
                      Model{' '}
                      <span className="font-medium normal-case text-gray-400">
                        (optional)
                      </span>
                    </label>
                    <input
                      type="text"
                      value={ownModel}
                      onChange={(event) => {
                        setOwnModel(event.target.value);
                        resetDownstream();
                      }}
                      placeholder="e.g. Click 125i"
                      className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:placeholder:text-gray-500 dark:focus:border-primary-500"
                    />
                  </div>
                </div>

                <p className="mt-3 rounded-2xl bg-gray-50 px-4 py-3 text-xs leading-5 text-gray-600 ring-1 ring-gray-100 dark:bg-dark-900/70 dark:text-gray-400 dark:ring-dark-700">
                  Adding make/model helps narrow compatible parts. Leave it
                  blank to browse all available parts.
                </p>
              </section>
            )}

            {/* Reference model */}
            {imageSource === 'reference' && (
              <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-700 dark:bg-dark-800">
                <StepHeader
                  number={2}
                  title="Select Motorcycle Model"
                  description="Choose a motorcycle reference image from your database."
                />

                <select
                  value={selectedModelId}
                  onChange={(event) => {
                    setSelectedModelId(event.target.value);
                    resetDownstream();
                  }}
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:focus:border-primary-500"
                >
                  <option value="">Choose a model...</option>
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.make} {model.model}{' '}
                      {model.year_range ? `(${model.year_range})` : ''}
                    </option>
                  ))}
                </select>

                {selectedModel?.reference_photo_url ? (
                  <div className="mt-4 overflow-hidden rounded-3xl border border-gray-200 bg-gray-50 dark:border-dark-700 dark:bg-dark-900">
                    <img
                      src={selectedModel.reference_photo_url}
                      alt={`${selectedModel.make} ${selectedModel.model}`}
                      className="max-h-72 w-full object-contain"
                    />
                  </div>
                ) : selectedModelId ? (
                  <div className="mt-4 rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm font-semibold text-yellow-700 dark:border-yellow-500/25 dark:bg-yellow-500/10 dark:text-yellow-300">
                    This model has no reference photo yet.
                  </div>
                ) : null}
              </section>
            )}

            {/* Parts */}
            {readyForParts && (
              <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-700 dark:bg-dark-800">
                <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                  <StepHeader
                    number={3}
                    title="Select Compatible Parts"
                    description="Choose up to 3 parts. Selecting another part in the same category will swap the old one."
                  />

                  <span
                    className={`rounded-full px-3 py-1 text-xs font-black ${
                      selectedParts.length >= MAX_PREVIEW_PARTS
                        ? 'bg-accent-50 text-accent-700 ring-1 ring-accent-200 dark:bg-accent-500/10 dark:text-accent-300 dark:ring-accent-500/25'
                        : 'bg-gray-100 text-gray-600 dark:bg-dark-900 dark:text-gray-400'
                    }`}
                  >
                    {selectedParts.length}/{MAX_PREVIEW_PARTS} selected
                  </span>
                </div>

                <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto]">
                  <div className="relative">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                      🔍
                    </span>
                    <input
                      type="text"
                      placeholder="Search parts, categories, or models..."
                      value={partSearch}
                      onChange={(event) => setPartSearch(event.target.value)}
                      className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-10 py-3 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:placeholder:text-gray-500 dark:focus:border-primary-500"
                    />
                    {partSearch && (
                      <button
                        type="button"
                        onClick={() => setPartSearch('')}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-400 transition hover:text-gray-700 dark:hover:text-white"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setPartSearch('');
                      setPartCategory('all');
                    }}
                    className="rounded-2xl border border-gray-200 px-4 py-3 text-sm font-bold text-gray-700 transition hover:border-primary-300 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300 dark:hover:border-primary-500/40 dark:hover:text-primary-300"
                  >
                    Clear
                  </button>
                </div>

                <div className="mb-4 flex flex-wrap gap-2">
                  {categories.map((item) => {
                    const active = partCategory === item.name;
                    const label = item.name === 'all' ? 'All' : item.name;
                    const hasSelection =
                      item.name !== 'all' && selectedCategories.has(item.name);

                    return (
                      <button
                        key={item.name}
                        type="button"
                        onClick={() =>
                          setPartCategory(active ? 'all' : item.name)
                        }
                        className={`rounded-full px-4 py-2 text-xs font-black capitalize transition ${
                          active
                            ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 dark:bg-dark-900 dark:text-gray-400 dark:hover:bg-dark-700 dark:hover:text-white'
                        }`}
                      >
                        {label}
                        <span
                          className={active ? 'ml-1 opacity-80' : 'ml-1 opacity-60'}
                        >
                          ({item.count})
                        </span>
                        {hasSelection && (
                          <span className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-accent-400 align-middle" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {pageLoading ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[1, 2, 3, 4].map((item) => (
                      <div
                        key={item}
                        className="h-28 animate-pulse rounded-3xl bg-gray-100 dark:bg-dark-900"
                      />
                    ))}
                  </div>
                ) : compatibleParts.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center dark:border-dark-700 dark:bg-dark-900/60">
                    <p className="text-sm font-bold text-gray-700 dark:text-gray-300">
                      No compatible parts found for{' '}
                      {motorcycleLabel || 'your motorcycle'}.
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Try clearing the make/model field to browse all parts.
                    </p>
                  </div>
                ) : filteredParts.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center dark:border-dark-700 dark:bg-dark-900/60">
                    <p className="text-sm font-bold text-gray-700 dark:text-gray-300">
                      No parts match your search.
                    </p>
                  </div>
                ) : (
                  <div className="grid max-h-[560px] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
                    {filteredParts.map((part) => {
                      const isSelected = selectedParts.includes(part.id);
                      const partCategoryName = part.category || 'General';
                      const hasImage = Boolean(part.ai_reference_url || part.image_url);
                      const isDisabled =
                        !isSelected &&
                        selectedParts.length >= MAX_PREVIEW_PARTS &&
                        !selectedCategories.has(partCategoryName);
                      const willSwap =
                        !isSelected &&
                        !isDisabled &&
                        selectedCategories.has(partCategoryName);

                      return (
                        <article
                          key={part.id}
                          className={`group rounded-3xl border p-3 transition ${
                            isSelected
                              ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-500/10 dark:bg-primary-900/20'
                              : isDisabled
                              ? 'border-gray-200 bg-gray-50 opacity-50 dark:border-dark-700 dark:bg-dark-900/40'
                              : 'border-gray-200 bg-gray-50 hover:border-primary-200 hover:bg-white dark:border-dark-700 dark:bg-dark-900/60 dark:hover:border-primary-500/30 dark:hover:bg-dark-900'
                          }`}
                        >
                          <label
                            className={`flex gap-3 ${
                              isDisabled ? 'cursor-not-allowed' : 'cursor-pointer'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() =>
                                !isDisabled && togglePart(part.id)
                              }
                              disabled={isDisabled}
                              className="mt-4 h-4 w-4 accent-primary-600"
                            />

                            <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-2xl bg-white ring-1 ring-gray-200 dark:bg-dark-800 dark:ring-dark-700">
                              {part.image_url ? (
                                <img
                                  src={part.image_url}
                                  alt={part.name}
                                  className="h-full w-full object-cover transition group-hover:scale-105"
                                />
                              ) : (
                                <div className="grid h-full w-full place-items-center text-xs text-gray-400">
                                  No image
                                </div>
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <p className="line-clamp-2 text-sm font-black leading-5 text-gray-950 dark:text-white">
                                {part.name}
                              </p>
                              <p className="mt-1 text-xs font-semibold capitalize text-gray-500 dark:text-gray-400">
                                {partCategoryName}
                                {willSwap && (
                                  <span className="text-accent-600 dark:text-accent-400">
                                    {' '}
                                    · will replace current pick
                                  </span>
                                )}
                              </p>

                              {!hasImage && (
                                <p className="mt-1 text-[11px] font-bold text-red-500 dark:text-red-300">
                                  Needs AI reference image
                                </p>
                              )}

                              <p className="mt-2 text-sm font-black text-accent-600 dark:text-accent-400">
                                {formatPeso(part.price)}
                              </p>
                            </div>
                          </label>

                          <button
                            type="button"
                            onClick={() => handleAddToCart(part)}
                            className="mt-3 w-full rounded-2xl border border-gray-200 bg-white px-3 py-2 text-xs font-black text-gray-700 transition hover:border-primary-300 hover:text-primary-700 dark:border-dark-700 dark:bg-dark-800 dark:text-gray-300 dark:hover:border-primary-500/40 dark:hover:text-primary-300"
                          >
                            + Add to Cart
                          </button>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {readyForParts && (
              <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-700 dark:bg-dark-800">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={agreedToAiConsent}
                    onChange={(event) => setAgreedToAiConsent(event.target.checked)}
                    className="mt-1 accent-primary-600"
                  />
                  <span className="text-xs leading-5 text-gray-600 dark:text-gray-400">
                    <span className="block text-sm font-black text-gray-950 dark:text-white">
                      {aiPhotoConsent?.title || 'AI Photo Processing Consent'}
                    </span>
                    {consentLoading
                      ? 'Loading privacy consent...'
                      : aiPhotoConsent?.consent_text ||
                        'I agree that MotoFix may process my uploaded motorcycle photo only for generating the customization preview.'}
                    <span className="mt-2 block rounded-2xl bg-gray-50 px-3 py-2 text-[11px] text-gray-500 ring-1 ring-gray-100 dark:bg-dark-900/70 dark:text-gray-400 dark:ring-dark-700">
                      MotoFix will use the selected motorcycle photo, selected parts, and AI reference images only to generate your preview.
                    </span>
                  </span>
                </label>
              </section>
            )}

            <button
              type="button"
              onClick={handleGenerate}
              disabled={loading || !readyForParts || selectedParts.length === 0}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-primary-600/25 transition hover:bg-primary-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Generating Preview...
                </>
              ) : (
                <>✨ Generate AI Preview</>
              )}
            </button>
          </div>

          {/* Result */}
          <aside className="space-y-6">
            <section className="sticky top-24 rounded-3xl border border-gray-200 bg-white p-5 shadow-xl shadow-gray-200/60 dark:border-dark-700 dark:bg-dark-800 dark:shadow-black/20">
              <div className="mb-4">
                <h2 className="text-lg font-black tracking-tight text-gray-950 dark:text-white">
                  Preview Result
                </h2>
                <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
                  Your generated motorcycle preview will appear here. Click the image to enlarge it.
                </p>
              </div>

              <div className="flex min-h-[360px] items-center justify-center rounded-3xl border border-gray-100 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900/70">
                {loading ? (
                  <div className="text-center">
                    <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-primary-500/20 border-t-primary-600" />
                    <p className="text-sm font-bold text-gray-700 dark:text-gray-300">
                      Generating your preview...
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Keep this page open while the image is being generated.
                    </p>
                  </div>
                ) : resultImage ? (
                  <div className="w-full">
                    <button
                      type="button"
                      onClick={() => setLightboxOpen(true)}
                      aria-label="Open generated preview in full screen"
                      className="group relative block w-full cursor-zoom-in"
                    >
                      <img
                        src={resultImage}
                        alt="AI Generated Preview"
                        className="max-h-[420px] w-full rounded-2xl object-contain transition group-hover:opacity-90"
                      />
                      <span className="absolute bottom-3 right-3 rounded-full bg-black/70 px-3 py-1.5 text-xs font-bold text-white opacity-0 transition group-hover:opacity-100">
                        🔍 Enlarge
                      </span>
                    </button>
                  </div>
                ) : (
                  <div className="px-6 text-center">
                    <div className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-3xl bg-primary-50 text-4xl ring-1 ring-primary-100 dark:bg-primary-900/20 dark:ring-primary-500/20">
                      ✨
                    </div>
                    <p className="text-sm font-bold text-gray-700 dark:text-gray-300">
                      No preview generated yet
                    </p>
                    <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
                      Choose a photo source and select parts to generate a
                      preview.
                    </p>
                  </div>
                )}
              </div>

              {selectedPartObjects.length > 0 && (
                <div className="mt-4 rounded-3xl border border-gray-100 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900/70">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-xs font-black uppercase tracking-wider text-gray-600 dark:text-gray-400">
                      Selected Parts Estimate
                    </p>
                    <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-black text-primary-700 dark:bg-primary-900/25 dark:text-primary-300">
                      {selectedPartObjects.length}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {selectedPartObjects.map((part) => (
                      <div
                        key={part.id}
                        className="flex justify-between gap-3 text-xs"
                      >
                        <span className="truncate font-semibold text-gray-600 dark:text-gray-400">
                          {part.name}
                        </span>
                        <span className="shrink-0 font-black text-accent-600 dark:text-accent-400">
                          {formatPeso(part.price)}
                        </span>
                      </div>
                    ))}

                    <div className="flex justify-between border-t border-gray-200 pt-3 text-sm dark:border-dark-700">
                      <span className="font-black text-gray-950 dark:text-white">
                        Total Parts Estimate
                      </span>
                      <span className="font-black text-accent-600 dark:text-accent-400">
                        {formatPeso(totalEstimate)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {resultImage && (
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <a
                    href={resultImage}
                    download="motofix-preview.png"
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-2xl border border-gray-200 px-4 py-3 text-center text-xs font-black text-gray-700 transition hover:border-primary-300 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300 dark:hover:border-primary-500/40 dark:hover:text-primary-300"
                  >
                    ⬇ Download
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setResultImage(null);
                      setSelectedParts([]);
                    }}
                    className="rounded-2xl border border-gray-200 px-4 py-3 text-xs font-black text-gray-700 transition hover:border-primary-300 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300 dark:hover:border-primary-500/40 dark:hover:text-primary-300"
                  >
                    🔄 Reset
                  </button>
                </div>
              )}
            </section>
          </aside>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxOpen && resultImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 px-4 backdrop-blur-md"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            aria-label="Close full screen preview"
            className="absolute right-5 top-5 grid h-11 w-11 place-items-center rounded-2xl bg-white/10 text-2xl leading-none text-white transition hover:bg-white/20"
          >
            ✕
          </button>
          <img
            src={resultImage}
            alt="AI Generated Preview enlarged"
            className="max-h-[90vh] max-w-full rounded-3xl object-contain shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}