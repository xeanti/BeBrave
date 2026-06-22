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
  const [savedPhotoUrl, setSavedPhotoUrl] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [certificates, setCertificates] = useState([]);
  const [loadingCerts, setLoadingCerts] = useState(false);

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

      if (profile.role === 'mechanic') {
        setSavedPhotoUrl(profile.mechanic_photo_url || null);
        setPhotoPreview(profile.mechanic_photo_url || null);
        fetchCertificates(profile.id);
      } else {
        setSavedPhotoUrl(profile.moto_photo_url || null);
        setPhotoPreview(profile.moto_photo_url || null);
      }
    }
  }, [profile]);

  async function fetchCertificates(mechanicId) {
    setLoadingCerts(true);
    const { data } = await supabase
      .from('mechanic_certificates')
      .select('*')
      .eq('mechanic_id', mechanicId)
      .order('created_at', { ascending: false });
    if (data) setCertificates(data);
    setLoadingCerts(false);
  }

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  function handlePhotoChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setMessage('');
    setError('');
  }

  async function handlePhotoUpload() {
    if (!photoFile) return null;
    setUploadingPhoto(true);
    try {
      const fileExt = photoFile.name.split('.').pop();
      const prefix = profile?.role === 'mechanic' ? 'mechanic' : 'profile';
      const filePath = `${user.id}/${prefix}_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('motorcycle-photos')
        .upload(filePath, photoFile, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('motorcycle-photos')
        .getPublicUrl(filePath);

      return urlData.publicUrl;
    } catch (err) {
      throw err;
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage('');
    setError('');
    setSaving(true);

    try {
      let newPhotoUrl = null;

      if (photoFile) {
        newPhotoUrl = await handlePhotoUpload();
      }

      const updatePayload = {
        first_name: form.first_name,
        last_name: form.last_name,
        phone: form.phone || null,
      };

      if (profile?.role === 'mechanic') {
        updatePayload.specialization = form.specialization || null;
        if (newPhotoUrl) updatePayload.mechanic_photo_url = newPhotoUrl;
      } else {
        updatePayload.moto_make = form.moto_make || null;
        updatePayload.moto_model = form.moto_model || null;
        updatePayload.moto_year = form.moto_year ? parseInt(form.moto_year) : null;
        if (newPhotoUrl) updatePayload.moto_photo_url = newPhotoUrl;
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update(updatePayload)
        .eq('id', user.id);

      if (updateError) throw updateError;

      if (newPhotoUrl) setSavedPhotoUrl(newPhotoUrl);
      setPhotoFile(null);
      setMessage('Profile updated successfully!');
    } catch (err) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  }

  const displayPhoto = savedPhotoUrl || photoPreview;
  const isMechanic = profile?.role === 'mechanic';

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

          {/* ── Profile Picture Card ── */}
          <div className="bg-dark-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="text-primary-500">●</span>
              {isMechanic ? 'Profile Photo' : 'Motorcycle Photo'}
            </h2>

            <div className="flex items-center gap-6">
              {/* Avatar / Photo Preview */}
              <div className="relative flex-shrink-0">
                {displayPhoto ? (
                  <img
                    src={displayPhoto}
                    alt="Profile"
                    className={`object-cover border-2 border-primary-500/30 ${
                      isMechanic
                        ? 'w-24 h-24 rounded-full'
                        : 'w-28 h-20 rounded-xl'
                    }`}
                  />
                ) : (
                  <div className={`bg-dark-900 border-2 border-dashed border-gray-600 flex items-center justify-center ${
                    isMechanic
                      ? 'w-24 h-24 rounded-full'
                      : 'w-28 h-20 rounded-xl'
                  }`}>
                    <span className="text-3xl">
                      {isMechanic ? '👤' : '🏍️'}
                    </span>
                  </div>
                )}

                {/* Camera overlay badge */}
                <label
                  htmlFor="photo-upload"
                  className="absolute -bottom-1 -right-1 w-8 h-8 bg-primary-600 hover:bg-primary-700 rounded-full flex items-center justify-center cursor-pointer transition shadow-lg"
                  title="Change photo"
                >
                  <span className="text-sm">📷</span>
                </label>
              </div>

              {/* Upload info */}
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-300 mb-1">
                  {isMechanic ? 'Your profile photo' : 'Your motorcycle photo'}
                </p>
                <p className="text-xs text-gray-500 mb-3">
                  JPG, PNG or WEBP. Max 5MB. Click the camera icon or the button below to change.
                </p>
                <label
                  htmlFor="photo-upload"
                  className="inline-flex items-center gap-2 cursor-pointer bg-dark-900 hover:bg-dark-700 border border-gray-700 hover:border-primary-500 px-4 py-2 rounded-lg text-sm transition"
                >
                  <span>📷</span>
                  <span>{photoFile ? 'Change Photo' : 'Upload Photo'}</span>
                </label>
                {photoFile && (
                  <p className="text-xs text-green-400 mt-2">
                    ✓ {photoFile.name} selected — save to apply
                  </p>
                )}
              </div>

              <input
                id="photo-upload"
                type="file"
                accept="image/*"
                onChange={handlePhotoChange}
                className="hidden"
              />
            </div>
          </div>

          {/* ── Account Info ── */}
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

          {/* ── Motorcycle Info (customers only) ── */}
          {!isMechanic && (
            <div className="bg-dark-800 rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="text-primary-500">●</span> My Motorcycle
              </h2>

              <div className="grid md:grid-cols-3 gap-4">
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
            </div>
          )}

          {/* ── Mechanic Info ── */}
          {isMechanic && (
            <div className="bg-dark-800 rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="text-primary-500">●</span> Mechanic Profile
              </h2>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Specialization</label>
                <input
                  name="specialization"
                  value={form.specialization}
                  onChange={handleChange}
                  placeholder="e.g. Engine Repair, Electrical, General Maintenance"
                  className="w-full px-3 py-2 rounded-md bg-dark-900 border border-gray-700 text-white focus:outline-none focus:border-primary-500"
                />
              </div>
            </div>
          )}

          {/* ── Certificates (mechanic read-only) ── */}
          {isMechanic && (
            <div className="bg-dark-800 rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
                <span className="text-primary-500">●</span> My Certificates
              </h2>
              <p className="text-xs text-gray-500 mb-4">
                Certificates are uploaded and managed by an administrator.
              </p>

              {loadingCerts ? (
                <p className="text-gray-400 text-sm">Loading...</p>
              ) : certificates.length === 0 ? (
                <p className="text-gray-500 text-sm">No certificates on file yet.</p>
              ) : (
                <div className="space-y-2">
                  {certificates.map((c) => (
                    <div key={c.id} className="flex items-center justify-between bg-dark-900 rounded-lg p-3 border border-gray-800">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-base flex-shrink-0">📄</span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white truncate">{c.name}</p>
                          <p className="text-xs text-gray-500">
                            Uploaded {new Date(c.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      
<a
  href={c.file_url}
  target="_blank"
  rel="noreferrer"
  className="text-xs text-primary-400 border border-primary-500/30 px-2.5 py-1 rounded-md hover:bg-primary-500/10 transition flex-shrink-0"
>
  View
</a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Save Button ── */}
          <button
            type="submit"
            disabled={saving || uploadingPhoto}
            className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-semibold py-3 rounded-md transition flex items-center justify-center gap-2"
          >
            {(saving || uploadingPhoto) && (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
            {saving || uploadingPhoto ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>
    </div>
  );
}