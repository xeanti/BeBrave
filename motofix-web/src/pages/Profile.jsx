import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';

export default function Profile() {
  const { user, profile, refreshProfile } = useAuth();

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

  // Certificate Upload States
  const [certName, setCertName] = useState('');
  const [certFile, setCertFile] = useState(null);
  const [uploadingCert, setUploadingCert] = useState(false);
  const [certError, setCertError] = useState('');
  const [certSuccess, setCertSuccess] = useState('');
  const [deletingCertId, setDeletingCertId] = useState(null);

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

      // Unified profile picture for every role
      setSavedPhotoUrl(profile.profile_photo_url || null);
      setPhotoPreview(profile.profile_photo_url || null);

      if (profile.role === 'mechanic') {
        fetchCertificates(profile.id);
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
      const filePath = `${user.id}/profile_${Date.now()}.${fileExt}`;

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

      if (newPhotoUrl) updatePayload.profile_photo_url = newPhotoUrl;

      if (profile?.role === 'mechanic') {
        updatePayload.specialization = form.specialization || null;
      } else {
        updatePayload.moto_make = form.moto_make || null;
        updatePayload.moto_model = form.moto_model || null;
        updatePayload.moto_year = form.moto_year ? parseInt(form.moto_year) : null;
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update(updatePayload)
        .eq('id', user.id);

      if (updateError) throw updateError;

      // Sync context so the form doesn't revert on re-render
      await refreshProfile();

      if (newPhotoUrl) setSavedPhotoUrl(newPhotoUrl);
      setPhotoFile(null);
      setMessage('Profile updated successfully!');
    } catch (err) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  }

  function handleCertFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setCertFile(file);
    if (!certName) {
      setCertName(file.name.replace(/\.[^/.]+$/, ''));
    }
  }

  async function handleUploadCertificate(e) {
    e.preventDefault();
    setCertError('');
    setCertSuccess('');
    if (!certName.trim()) { setCertError('Please enter a certificate name.'); return; }
    if (!certFile) { setCertError('Please choose a file to upload.'); return; }
    setUploadingCert(true);
    try {
      const fileExt = certFile.name.split('.').pop();
      const filePath = `${user.id}/${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('mechanic-certificates')
        .upload(filePath, certFile);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('mechanic-certificates')
        .getPublicUrl(filePath);

      const { error: insertError } = await supabase
        .from('mechanic_certificates')
        .insert({
          mechanic_id: user.id,
          name: certName.trim(),
          file_url: urlData.publicUrl,
          uploaded_by: user.id,
        });
      if (insertError) throw insertError;

      setCertName('');
      setCertFile(null);
      setCertSuccess('Certificate uploaded successfully!');
      fetchCertificates(user.id);
    } catch (err) {
      setCertError(err.message);
    } finally {
      setUploadingCert(false);
    }
  }

  async function handleDeleteCertificate(cert) {
    if (!confirm(`Delete "${cert.name}"?`)) return;
    setDeletingCertId(cert.id);
    try {
      await supabase.from('mechanic_certificates').delete().eq('id', cert.id);
      fetchCertificates(user.id);
    } finally {
      setDeletingCertId(null);
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
              <span className="text-primary-500">●</span> Profile Picture
            </h2>

            <div className="flex items-center gap-6">
              <div className="relative flex-shrink-0">
                {displayPhoto ? (
                  <img
                    src={displayPhoto}
                    alt="Profile"
                    className="w-24 h-24 rounded-full object-cover border-2 border-primary-500/30"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-dark-900 border-2 border-dashed border-gray-600 flex items-center justify-center">
                    <span className="text-3xl">👤</span>
                  </div>
                )}

                <label
                  htmlFor="photo-upload"
                  className="absolute -bottom-1 -right-1 w-8 h-8 bg-primary-600 hover:bg-primary-700 rounded-full flex items-center justify-center cursor-pointer transition shadow-lg"
                  title="Change photo"
                >
                  <span className="text-sm">📷</span>
                </label>
              </div>

              <div className="flex-1">
                <p className="text-sm font-medium text-gray-300 mb-1">
                  Your profile photo
                </p>
                <p className="text-xs text-gray-500 mb-3">
                  JPG, PNG or WEBP. Max 5MB. This is shown to others (e.g. on bookings). Click the camera icon or the button below to change.
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

          {/* ── Certificates (mechanic management block) ── */}
          {isMechanic && (
            <div className="bg-dark-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <span className="text-primary-500">●</span> My Certificates
                </h2>
              </div>
              <p className="text-xs text-gray-500 mb-4">
                Upload your certifications and credentials.
              </p>

              {/* Upload form */}
              {certError && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg p-3 mb-3">
                  {certError}
                </div>
              )}
              {certSuccess && (
                <div className="bg-green-500/10 border border-green-500/30 text-green-400 text-sm rounded-lg p-3 mb-3">
                  {certSuccess}
                </div>
              )}

              <div className="bg-dark-900 rounded-lg p-4 flex flex-wrap items-end gap-3 mb-5 border border-gray-800">
                <div className="flex-1 min-w-[160px]">
                  <label className="block text-xs text-gray-500 mb-1">Certificate Name</label>
                  <input
                    type="text"
                    value={certName}
                    onChange={(e) => setCertName(e.target.value)}
                    placeholder="e.g. TESDA NC II"
                    className="w-full px-3 py-1.5 rounded-md bg-dark-800 border border-gray-700 text-sm text-white focus:outline-none focus:border-primary-500"
                  />
                </div>
                <div className="flex-1 min-w-[180px]">
                  <label className="block text-xs text-gray-500 mb-1">File (image or PDF)</label>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleCertFileChange}
                    className="w-full text-xs text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-primary-600 file:text-white file:cursor-pointer file:hover:bg-primary-700 file:text-xs"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleUploadCertificate}
                  disabled={uploadingCert}
                  className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 px-4 py-1.5 rounded-md text-sm font-medium transition text-white"
                >
                  {uploadingCert ? 'Uploading...' : '+ Upload'}
                </button>
              </div>

              {/* Certificates list */}
              {loadingCerts ? (
                <p className="text-gray-400 text-sm">Loading...</p>
              ) : certificates.length === 0 ? (
                <p className="text-gray-500 text-sm">No certificates uploaded yet.</p>
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
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <a
                          href={c.file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-primary-400 border border-primary-500/30 px-2.5 py-1 rounded-md hover:bg-primary-500/10 transition"
                        >
                          View
                        </a>
                        <button
                          type="button"
                          onClick={() => handleDeleteCertificate(c)}
                          disabled={deletingCertId === c.id}
                          className="text-xs text-red-400 border border-red-500/30 px-2.5 py-1 rounded-md hover:bg-red-500/10 transition disabled:opacity-50"
                        >
                          {deletingCertId === c.id ? '...' : 'Delete'}
                        </button>
                      </div>
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