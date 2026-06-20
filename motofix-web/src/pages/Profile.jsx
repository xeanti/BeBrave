import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';

export default function Profile() {
  const { user, profile } = useAuth();

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    moto_make: '',
    moto_model: '',
    moto_year: '',
    specialization: '',
  });
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        first_name: profile.first_name || '',
        last_name: profile.last_name || '',
        phone: profile.phone || '',
        moto_make: profile.moto_make || '',
        moto_model: profile.moto_model || '',
        moto_year: profile.moto_year || '',
        specialization: profile.specialization || '',
      });
      
      // Conditionally set the initial preview depending on user role
      if (profile.role === 'mechanic') {
        setPhotoPreview(profile.mechanic_photo_url || null);
      } else {
        setPhotoPreview(profile.moto_photo_url || null);
      }
    }
  }, [profile]);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  function handlePhotoChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage('');
    setError('');
    setSaving(true);

    try {
      let moto_photo_url = profile?.moto_photo_url || null;
      let mechanic_photo_url = profile?.mechanic_photo_url || null;

      if (photoFile) {
        const fileExt = photoFile.name.split('.').pop();
        // Dynamically name the storage path based on the user's role
        const prefix = profile?.role === 'mechanic' ? 'mechanic' : 'profile';
        const filePath = `${user.id}/${prefix}_${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('motorcycle-photos')
          .upload(filePath, photoFile);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('motorcycle-photos')
          .getPublicUrl(filePath);

        if (profile?.role === 'mechanic') {
          mechanic_photo_url = urlData.publicUrl;
        } else {
          moto_photo_url = urlData.publicUrl;
        }
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          first_name: form.first_name,
          last_name: form.last_name,
          phone: form.phone,
          moto_make: profile?.role === 'mechanic' ? null : form.moto_make,
          moto_model: profile?.role === 'mechanic' ? null : form.moto_model,
          moto_year: (profile?.role !== 'mechanic' && form.moto_year) ? parseInt(form.moto_year) : null,
          moto_photo_url: profile?.role === 'mechanic' ? profile?.moto_photo_url : moto_photo_url,
          specialization: profile?.role === 'mechanic' ? form.specialization : null,
          mechanic_photo_url: profile?.role === 'mechanic' ? mechanic_photo_url : profile?.mechanic_photo_url,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (updateError) throw updateError;

      setMessage('Profile updated successfully!');
    } catch (err) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-72px)] bg-dark-900 text-white px-6 py-10">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">My Profile</h1>
        <p className="text-gray-400 mb-8">Manage your personal information and profile details.</p>

        {message && (
          <div className="bg-green-500/10 border border-green-500 text-green-400 text-sm rounded-md p-3 mb-4">
            {message}
          </div>
        )}
        {error && (
          <div className="bg-red-500/10 border border-red-500 text-red-400 text-sm rounded-md p-3 mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Account Info */}
          <div className="bg-dark-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="text-primary-500">●</span> Account Information
            </h2>

            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm text-gray-300 mb-1">First Name</label>
                <input
                  name="first_name"
                  value={form.first_name}
                  onChange={handleChange}
                  className="w-full px-3 py-2 rounded-md bg-dark-900 border border-gray-700 text-white focus:outline-none focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Last Name</label>
                <input
                  name="last_name"
                  value={form.last_name}
                  onChange={handleChange}
                  className="w-full px-3 py-2 rounded-md bg-dark-900 border border-gray-700 text-white focus:outline-none focus:border-primary-500"
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-300 mb-1">Email</label>
                <input
                  value={profile?.email || ''}
                  disabled
                  className="w-full px-3 py-2 rounded-md bg-dark-900/50 border border-gray-800 text-gray-500 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Phone</label>
                <input
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  placeholder="09XX XXX XXXX"
                  className="w-full px-3 py-2 rounded-md bg-dark-900 border border-gray-700 text-white focus:outline-none focus:border-primary-500"
                />
              </div>
            </div>

            <div className="mt-4">
              <span className="inline-block text-xs px-3 py-1 rounded-full bg-primary-500/20 text-primary-400 capitalize">
                {profile?.role || 'customer'}
              </span>
            </div>
          </div>

          {/* Motorcycle Info - Only displays if user is NOT a mechanic */}
          {profile?.role !== 'mechanic' && (
            <div className="bg-dark-800 rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="text-primary-500">●</span> My Motorcycle
              </h2>

              <div className="grid md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Make</label>
                  <input
                    name="moto_make"
                    value={form.moto_make}
                    onChange={handleChange}
                    placeholder="e.g. Yamaha"
                    className="w-full px-3 py-2 rounded-md bg-dark-900 border border-gray-700 text-white focus:outline-none focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Model</label>
                  <input
                    name="moto_model"
                    value={form.moto_model}
                    onChange={handleChange}
                    placeholder="e.g. Aerox 155"
                    className="w-full px-3 py-2 rounded-md bg-dark-900 border border-gray-700 text-white focus:outline-none focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Year</label>
                  <input
                    type="number"
                    name="moto_year"
                    value={form.moto_year}
                    onChange={handleChange}
                    placeholder="e.g. 2023"
                    className="w-full px-3 py-2 rounded-md bg-dark-900 border border-gray-700 text-white focus:outline-none focus:border-primary-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-2">Motorcycle Photo</label>
                <div className="flex items-center gap-4">
                  {photoPreview ? (
                    <img
                      src={photoPreview}
                      alt="Motorcycle"
                      className="w-24 h-24 object-cover rounded-lg border border-gray-700"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-lg bg-dark-900 border border-gray-700 flex items-center justify-center text-gray-500 text-xs text-center px-2">
                      No photo
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoChange}
                    className="text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-primary-600 file:text-white file:cursor-pointer file:hover:bg-primary-700"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Mechanic Info - Only displays if user IS a mechanic */}
          {profile?.role === 'mechanic' && (
            <div className="bg-dark-800 rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="text-primary-500">●</span> Mechanic Profile
              </h2>
              <div className="mb-4">
                <label className="block text-sm text-gray-300 mb-1">Specialization</label>
                <input
                  name="specialization"
                  value={form.specialization}
                  onChange={handleChange}
                  placeholder="e.g. Engine Repair, Electrical, General Maintenance"
                  className="w-full px-3 py-2 rounded-md bg-dark-900 border border-gray-700 text-white focus:outline-none focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-2">Profile Photo</label>
                <div className="flex items-center gap-4">
                  {photoPreview ? (
                    <img src={photoPreview} alt="Profile" className="w-24 h-24 object-cover rounded-full border border-gray-700" />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-dark-900 border border-gray-700 flex items-center justify-center text-gray-500 text-xs">
                      No photo
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoChange}
                    className="text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-primary-600 file:text-white file:cursor-pointer file:hover:bg-primary-700"
                  />
                </div>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-semibold py-3 rounded-md transition"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>
    </div>
  );
}