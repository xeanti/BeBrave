import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { supabase } from '../lib/supabaseClient';

export default function Shop() {
  const { profile } = useAuth();
  const { addToCart, cart } = useCart();

  const [parts, setParts] = useState([]);
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [selectedModel, setSelectedModel] = useState('all');
  const [cartMessage, setCartMessage] = useState('');

  useEffect(() => {
    fetchParts();
    fetchModels();
  }, []);

  async function fetchParts() {
    const { data } = await supabase
      .from('parts')
      .select('*')
      .gt('stock_quantity', 0)
      .order('name', { ascending: true });
    if (data) setParts(data);
    setLoading(false);
  }

  async function fetchModels() {
    const { data } = await supabase
      .from('motorcycle_models')
      .select('id, make, model')
      .order('make', { ascending: true });
    if (data) setModels(data);
  }

  function handleAddToCart(part) {
    addToCart(part);
    setCartMessage(`${part.name} added to cart!`);
    setTimeout(() => setCartMessage(''), 2000);
  }

  const categories = ['all', ...new Set(parts.map((p) => p.category).filter(Boolean))];

  const filteredParts = parts.filter((p) => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchCategory = category === 'all' || p.category === category;
    const matchModel =
      selectedModel === 'all' ||
      (p.compatible_models && p.compatible_models.includes(selectedModel));
    return matchSearch && matchCategory && matchModel;
  });

  const cartItemIds = cart.map((c) => c.id);

  return (
    <div className="min-h-[calc(100vh-65px)] bg-dark-900 text-white px-6 py-10">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-1">Parts Shop</h1>
          <p className="text-gray-400">
            Browse compatible motorcycle parts and add them to your cart.
          </p>
        </div>

        {/* Cart message toast */}
        {cartMessage && (
          <div className="fixed bottom-6 right-6 z-50 bg-green-500 text-white text-sm px-4 py-3 rounded-xl shadow-lg flex items-center gap-2">
            🛒 {cartMessage}
          </div>
        )}

        {/* Filters */}
        <div className="bg-dark-800 rounded-xl p-4 mb-6 flex flex-col md:flex-row gap-3">
          {/* Search */}
          <input
            type="text"
            placeholder="Search parts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500"
          />

          {/* Model filter */}
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500"
          >
            <option value="all">All Models</option>
            {models.map((m) => (
              <option key={m.id} value={`${m.make} ${m.model}`}>
                {m.make} {m.model}
              </option>
            ))}
          </select>
        </div>

        {/* Category tabs */}
        <div className="flex gap-2 flex-wrap mb-6">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium capitalize transition ${
                category === cat
                  ? 'bg-primary-600 text-white'
                  : 'bg-dark-800 text-gray-400 hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Results count */}
        <p className="text-sm text-gray-500 mb-4">
          {filteredParts.length} {filteredParts.length === 1 ? 'part' : 'parts'} found
          {selectedModel !== 'all' ? ` for ${selectedModel}` : ''}
        </p>

        {/* Parts grid */}
        {loading ? (
          <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[1,2,3,4,5,6,7,8].map((i) => (
              <div key={i} className="bg-dark-800 rounded-xl h-64 animate-pulse" />
            ))}
          </div>
        ) : filteredParts.length === 0 ? (
          <div className="bg-dark-800 rounded-xl p-16 text-center">
            <p className="text-4xl mb-3">🔍</p>
            <p className="text-gray-400">No parts found matching your filters.</p>
            <button
              onClick={() => { setSearch(''); setCategory('all'); setSelectedModel('all'); }}
              className="text-primary-400 text-sm mt-2 hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredParts.map((part) => {
              const inCart = cartItemIds.includes(part.id);
              const isLowStock = part.stock_quantity <= part.reorder_threshold;

              return (
                <div key={part.id}
                  className="bg-dark-800 rounded-xl overflow-hidden flex flex-col hover:border-primary-500/30 border border-transparent transition">

                  {/* Part image */}
                  <div className="h-40 bg-dark-900 flex items-center justify-center overflow-hidden">
                    {part.image_url ? (
                      <img
                        src={part.image_url}
                        alt={part.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-4xl">⚙️</div>
                    )}
                  </div>

                  {/* Part info */}
                  <div className="p-4 flex flex-col flex-1">
                    <div className="flex-1">
                      <p className="font-semibold text-sm mb-1">{part.name}</p>
                      <span className="inline-block text-xs bg-dark-900 text-gray-400 px-2 py-0.5 rounded-full capitalize mb-2">
                        {part.category || 'General'}
                      </span>

                      {/* Compatible models */}
                      {part.compatible_models?.length > 0 && (
                        <div className="mb-2">
                          <p className="text-xs text-gray-500 mb-1">Compatible with:</p>
                          <div className="flex flex-wrap gap-1">
                            {part.compatible_models.slice(0, 2).map((model, i) => (
                              <span key={i} className="text-xs bg-primary-500/10 text-primary-400 px-2 py-0.5 rounded-full">
                                {model}
                              </span>
                            ))}
                            {part.compatible_models.length > 2 && (
                              <span className="text-xs text-gray-500">+{part.compatible_models.length - 2} more</span>
                            )}
                          </div>
                        </div>
                      )}

                      {isLowStock && (
                        <p className="text-xs text-red-400 mb-2">⚠ Only {part.stock_quantity} left!</p>
                      )}
                    </div>

                    <div className="flex items-center justify-between mt-3">
                      <p className="text-lg font-bold text-accent-400">₱{part.price}</p>
                      <button
                        onClick={() => handleAddToCart(part)}
                        className={`text-sm px-3 py-1.5 rounded-lg font-medium transition ${
                          inCart
                            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                            : 'bg-primary-600 hover:bg-primary-700 text-white'
                        }`}
                      >
                        {inCart ? '✓ In Cart' : '+ Add to Cart'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}