import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { supabase } from '../lib/supabaseClient';

export default function Customize() {
  const { user } = useAuth();
  const { addToCart } = useCart();

  // Step 1: photo source
  const [imageSource, setImageSource] = useState(''); // '' | 'own' | 'reference'

  // Reference flow
  const [models, setModels] = useState([]);
  const [selectedModelId, setSelectedModelId] = useState('');

  // Own photo flow
  const [uploadedPhoto, setUploadedPhoto] = useState(null);
  const [uploadedPreview, setUploadedPreview] = useState(null);
  const [ownMake, setOwnMake] = useState('');
  const [ownModel, setOwnModel] = useState('');

  // Parts
  const [parts, setParts] = useState([]);
  const [selectedParts, setSelectedParts] = useState([]);
  const [partSearch, setPartSearch] = useState('');
  const [partCategory, setPartCategory] = useState('all');
  const [partMessage, setPartMessage] = useState('');

  // Result
  const [resultImage, setResultImage] = useState(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cartMessage, setCartMessage] = useState('');

  useEffect(() => {
    fetchModels();
    fetchAllParts();
  }, []);

  async function fetchModels() {
    const { data } = await supabase
      .from('motorcycle_models')
      .select('*')
      .order('make', { ascending: true });
    if (data) setModels(data);
  }

  async function fetchAllParts() {
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
    setUploadedPhoto(null);
    setUploadedPreview(null);
    setOwnMake('');
    setOwnModel('');
    resetDownstream();
  }

  function handlePhotoChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploadedPhoto(file);
    setUploadedPreview(URL.createObjectURL(file));
    setResultImage(null);
  }

  // One part per category — selecting a new part from an already-represented
  // category swaps out the old one instead of blocking the click.
  function togglePart(partId) {
    const part = parts.find((p) => p.id === partId);
    if (!part) return;

    setSelectedParts((prev) => {
      // Deselecting
      if (prev.includes(partId)) {
        return prev.filter((id) => id !== partId);
      }

      // Find any existing selection in the same category
      const existingInCategory = prev
        .map((id) => parts.find((p) => p.id === id))
        .find((p) => p?.category === part.category);

      const prevWithoutSameCategory = prev.filter((id) => {
        const p = parts.find((pp) => pp.id === id);
        return p?.category !== part.category;
      });

      if (prevWithoutSameCategory.length >= 3) {
        alert('You can only select up to 3 parts for the AI preview.');
        return prev;
      }

      if (existingInCategory) {
        setPartMessage(`Swapped "${existingInCategory.name}" for "${part.name}" — only 1 part per category.`);
        setTimeout(() => setPartMessage(''), 2500);
      }

      return [...prevWithoutSameCategory, partId];
    });
  }

  function handleAddToCart(part) {
    addToCart(part);
    setCartMessage(`${part.name} added to cart!`);
    setTimeout(() => setCartMessage(''), 2000);
  }

  const selectedModel = models.find((m) => m.id === selectedModelId);

  // Motorcycle label used for the AI prompt + part filtering
  const motorcycleLabel =
    imageSource === 'reference' && selectedModel
      ? `${selectedModel.make} ${selectedModel.model}`
      : imageSource === 'own'
      ? `${ownMake} ${ownModel}`.trim()
      : '';

  // Compatible parts — filtered by model if known, otherwise show everything
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

  // Categories already represented in the current selection
  const selectedCategories = useMemo(
    () =>
      new Set(
        selectedParts
          .map((id) => parts.find((p) => p.id === id)?.category)
          .filter(Boolean)
      ),
    [selectedParts, parts]
  );

  const readyForParts =
    (imageSource === 'reference' && selectedModelId) ||
    (imageSource === 'own' && uploadedPhoto);

  async function handleGenerate() {
    setError('');
    if (!imageSource) { setError('Please choose how you want to preview your motorcycle.'); return; }
    if (imageSource === 'reference' && !selectedModelId) { setError('Please select your motorcycle model.'); return; }
    if (imageSource === 'own' && !uploadedPhoto) { setError('Please upload a photo of your motorcycle.'); return; }
    if (selectedParts.length === 0) { setError('Please select at least one part to preview.'); return; }
    if (selectedParts.length > 3) { setError('Please select a maximum of 3 parts.'); return; }

    setLoading(true);
    setResultImage(null);

    try {
      let photoUrl;

      if (imageSource === 'reference') {
        photoUrl = selectedModel.reference_photo_url;
      } else {
        const fileExt = uploadedPhoto.name.split('.').pop();
        const filePath = `${user.id}/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('motorcycle-photos')
          .upload(filePath, uploadedPhoto);
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

  return (
    <div className="min-h-[calc(100vh-65px)] bg-dark-900 text-white px-6 py-10">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-1">AI Motorcycle Appearance Preview</h1>
          <p className="text-gray-400">
            Use your own photo or one of ours, pick up to 3 parts, and generate a realistic AI preview.
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg p-4 mb-6">
            {error}
          </div>
        )}

        {cartMessage && (
          <div className="bg-green-500/10 border border-green-500/30 text-green-400 text-sm rounded-lg p-3 mb-4">
            🛒 {cartMessage}
          </div>
        )}

        {partMessage && (
          <div className="bg-primary-500/10 border border-primary-500/30 text-primary-400 text-sm rounded-lg p-3 mb-4">
            🔁 {partMessage}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-5">

            {/* Step 1: Photo source — now first */}
            <div className="bg-dark-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3">
                1. How would you like to preview your motorcycle?
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => chooseSource('own')}
                  className={`rounded-xl p-4 text-left border transition ${
                    imageSource === 'own'
                      ? 'border-primary-500 bg-primary-500/10'
                      : 'border-gray-700 hover:border-gray-500'
                  }`}
                >
                  <div className="text-2xl mb-2">📤</div>
                  <p className="text-sm font-semibold">Use My Own Photo</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Upload a picture of your actual motorcycle. No need to pick a model.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => chooseSource('reference')}
                  className={`rounded-xl p-4 text-left border transition ${
                    imageSource === 'reference'
                      ? 'border-primary-500 bg-primary-500/10'
                      : 'border-gray-700 hover:border-gray-500'
                  }`}
                >
                  <div className="text-2xl mb-2">🏍️</div>
                  <p className="text-sm font-semibold">Choose From Our Models</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Don't have a photo handy? Pick your model and we'll use a reference photo.
                  </p>
                </button>
              </div>
            </div>

            {/* Step 2a: Own photo upload */}
            {imageSource === 'own' && (
              <div className="bg-dark-800 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3">
                  2. Upload Your Photo
                </h2>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoChange}
                  className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary-600 file:text-white file:cursor-pointer file:hover:bg-primary-700"
                />
                {uploadedPreview && (
                  <img src={uploadedPreview} alt="Your motorcycle"
                    className="mt-4 rounded-lg w-full object-cover max-h-52" />
                )}

                <div className="grid grid-cols-2 gap-3 mt-4">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Make (optional)</label>
                    <input
                      type="text"
                      value={ownMake}
                      onChange={(e) => setOwnMake(e.target.value)}
                      placeholder="e.g. Honda"
                      className="w-full px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Model (optional)</label>
                    <input
                      type="text"
                      value={ownModel}
                      onChange={(e) => setOwnModel(e.target.value)}
                      placeholder="e.g. Click 125i"
                      className="w-full px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500"
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Telling us your make/model just helps us narrow down compatible parts — leave blank to browse everything.
                </p>
              </div>
            )}

            {/* Step 2b: Reference model select */}
            {imageSource === 'reference' && (
              <div className="bg-dark-800 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3">
                  2. Select Your Motorcycle Model
                </h2>
                <select
                  value={selectedModelId}
                  onChange={(e) => { setSelectedModelId(e.target.value); resetDownstream(); }}
                  className="w-full px-3 py-2.5 rounded-lg bg-dark-900 border border-gray-700 text-white focus:outline-none focus:border-primary-500"
                >
                  <option value="">Choose a model...</option>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.make} {m.model} {m.year_range ? `(${m.year_range})` : ''}
                    </option>
                  ))}
                </select>

                {selectedModel?.reference_photo_url && (
                  <img src={selectedModel.reference_photo_url}
                    alt={`${selectedModel.make} ${selectedModel.model}`}
                    className="rounded-lg w-full object-cover max-h-52 mt-4" />
                )}
              </div>
            )}

            {/* Step 3: Parts */}
            {readyForParts && (
              <div className="bg-dark-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
                    3. Select Compatible Parts
                  </h2>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    selectedParts.length >= 3
                      ? 'bg-accent-500/20 text-accent-400'
                      : 'bg-dark-900 text-gray-400'
                  }`}>
                    {selectedParts.length}/3 for AI preview
                  </span>
                </div>

                <p className="text-xs text-gray-500 mb-3">
                  Only 1 part per category — picking another from the same category swaps your current pick.
                  {!motorcycleLabel && ' Showing all parts — add your make/model above to narrow this down.'}
                </p>

                {compatibleParts.length === 0 ? (
                  <p className="text-gray-400 text-sm">
                    No compatible parts found for {motorcycleLabel || 'your motorcycle'}.
                  </p>
                ) : (
                  <>
                    <input type="text" placeholder="Search parts..."
                      value={partSearch}
                      onChange={(e) => setPartSearch(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500 mb-2" />

                    <div className="flex gap-2 flex-wrap mb-3">
                      {categories.map((cat) => (
                        <button key={cat} type="button" onClick={() => setPartCategory(partCategory === cat ? 'all' : cat)}
                          className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition flex items-center gap-1 ${
                            partCategory === cat
                              ? 'bg-primary-600 text-white'
                              : 'bg-dark-900 text-gray-400 hover:text-white'
                          }`}>
                          {cat}
                          {cat !== 'all' && selectedCategories.has(cat) && (
                            <span className="w-1.5 h-1.5 rounded-full bg-accent-400" />
                          )}
                        </button>
                      ))}
                    </div>

                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {filteredParts.length === 0 ? (
                        <p className="text-gray-500 text-sm text-center py-4">No parts match your search.</p>
                      ) : (
                        filteredParts.map((part) => {
                          const isSelected = selectedParts.includes(part.id);
                          // Only disabled if we're at the 3-category cap AND this part's
                          // category isn't already one of the picks (so swaps still work).
                          const isDisabled =
                            !isSelected &&
                            selectedParts.length >= 3 &&
                            !selectedCategories.has(part.category);
                          const willSwap =
                            !isSelected && !isDisabled && selectedCategories.has(part.category);

                          return (
                            <div key={part.id}
                              className={`flex items-center justify-between bg-dark-900 rounded-lg p-3 transition ${
                                isSelected ? 'ring-1 ring-primary-500' : ''
                              }`}>
                              <label className={`flex items-center gap-3 flex-1 ${
                                isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                              }`}>
                                <input type="checkbox" checked={isSelected}
                                  onChange={() => !isDisabled && togglePart(part.id)}
                                  disabled={isDisabled}
                                  className="accent-primary-500" />
                                {part.image_url ? (
                                  <img src={part.image_url} alt={part.name}
                                    className="w-12 h-12 object-cover rounded-lg bg-dark-800" />
                                ) : (
                                  <div className="w-12 h-12 rounded-lg bg-dark-800 flex items-center justify-center text-gray-500 text-xs text-center">
                                    No image
                                  </div>
                                )}
                                <div>
                                  <p className="text-sm font-medium">{part.name}</p>
                                  <p className="text-xs text-gray-400 capitalize">
                                    {part.category}
                                    {willSwap && <span className="text-accent-400"> · will replace your current pick</span>}
                                  </p>
                                </div>
                              </label>
                              <div className="flex flex-col items-end gap-1 ml-2">
                                <span className="text-sm text-accent-400 font-medium">₱{part.price}</span>
                                <button type="button"
                                  onClick={() => handleAddToCart(part)}
                                  className="text-xs bg-dark-800 hover:bg-primary-600 border border-gray-700 hover:border-primary-500 px-2 py-1 rounded-md transition whitespace-nowrap">
                                  + Cart
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {selectedParts.length >= 3 && (
                      <p className="text-xs text-accent-400 mt-2 text-center">
                        Max 3 parts for AI preview. You can still add more to cart.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            <button onClick={handleGenerate}
              disabled={loading || !readyForParts || selectedParts.length === 0}
              className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Generating preview...
                </span>
              ) : '✨ Generate AI Preview'}
            </button>
          </div>

          {/* Right: result */}
          <div className="bg-dark-800 rounded-xl p-5 flex flex-col">
            <h3 className="font-semibold mb-1">Preview Result</h3>
            <p className="text-xs text-gray-500 mb-4">
              AI-generated appearance of your motorcycle with selected parts applied. Click the image to enlarge.
            </p>
            <div className="flex-1 flex items-center justify-center bg-dark-900 rounded-lg min-h-72">
              {loading ? (
                <div className="text-center">
                  <svg className="animate-spin h-8 w-8 text-primary-500 mx-auto mb-3" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  <p className="text-gray-400 text-sm">Generating your preview...</p>
                  <p className="text-gray-600 text-xs mt-1">This may take 1 - 3 minutes</p>
                </div>
              ) : resultImage ? (
                <div className="w-full">
                  <button
                    type="button"
                    onClick={() => setLightboxOpen(true)}
                    className="w-full block cursor-zoom-in group relative"
                  >
                    <img
                      src={resultImage}
                      alt="AI Generated Preview"
                      className="rounded-lg w-full object-contain max-h-96 transition group-hover:opacity-90"
                    />
                    <span className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition">
                      🔍 Click to enlarge
                    </span>
                  </button>

                  {selectedParts.length > 0 && (
                    <div className="mt-3 bg-dark-900 rounded-lg p-3 space-y-1.5">
                      <p className="text-xs font-semibold text-gray-300 mb-2">Selected Parts Estimate</p>
                      {parts
                        .filter((p) => selectedParts.includes(p.id))
                        .map((p) => (
                          <div key={p.id} className="flex justify-between text-xs">
                            <span className="text-gray-400">{p.name}</span>
                            <span className="text-accent-400 font-medium">₱{p.price}</span>
                          </div>
                        ))}
                      <div className="border-t border-gray-700 pt-1.5 flex justify-between text-xs font-semibold">
                        <span className="text-gray-300">Total Parts Estimate</span>
                        <span className="text-accent-400">
                          ₱{parts
                            .filter((p) => selectedParts.includes(p.id))
                            .reduce((sum, p) => sum + parseFloat(p.price), 0)
                            .toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="mt-3 flex gap-2">
                    <a href={resultImage} download="motofix-preview.png"
                      target="_blank" rel="noreferrer"
                      className="flex-1 text-center text-xs bg-dark-900 hover:bg-dark-900/70 border border-gray-700 rounded-lg py-2 transition">
                      ⬇ Download
                    </a>
                    <button
                      onClick={() => { setResultImage(null); setSelectedParts([]); }}
                      className="flex-1 text-xs bg-dark-900 hover:bg-dark-900/70 border border-gray-700 rounded-lg py-2 transition">
                      🔄 Reset
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center px-6">
                  <div className="text-4xl mb-3">✨</div>
                  <p className="text-gray-500 text-sm">
                    Your AI-generated motorcycle appearance preview will appear here.
                  </p>
                  <p className="text-gray-600 text-xs mt-2">
                    Choose a photo source, and up to 3 parts to get started.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxOpen && resultImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0,0,0,0.85)' }}
          onClick={() => setLightboxOpen(false)}
        >
          <button
            onClick={() => setLightboxOpen(false)}
            className="absolute top-5 right-5 text-white text-3xl leading-none hover:text-gray-300"
          >
            ✕
          </button>
          <img
            src={resultImage}
            alt="AI Generated Preview enlarged"
            className="max-w-full max-h-[90vh] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}