import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';

const MAX_PHOTO_SIZE_MB = 5;
const MAX_CERT_SIZE_MB = 10;

function formatDate(value) {
  if (!value) return '—';

  return new Date(value).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getInitials(firstName, lastName) {
  return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || '?';
}

function isImageFile(url = '') {
  return /\.(png|jpe?g|webp|gif|bmp|svg)(\?.*)?$/i.test(url);
}

function isValidFileSize(file, maxMb) {
  return file.size <= maxMb * 1024 * 1024;
}

function SectionCard({ title, description, icon, children }) {
  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm transition dark:border-dark-700 dark:bg-dark-800">
      <div className="mb-5 flex items-start gap-3">
        <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-2xl bg-primary-50 text-lg text-primary-700 ring-1 ring-primary-100 dark:bg-primary-500/10 dark:text-primary-400 dark:ring-primary-500/20">
          {icon}
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

      {children}
    </section>
  );
}

function Notice({ type = 'success', children }) {
  const styles = {
    success:
      'border-green-200 bg-green-50 text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300',
    error:
      'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300',
  };

  return (
    <div className={`mb-4 rounded-2xl border p-4 text-sm font-semibold ${styles[type]}`}>
      {children}
    </div>
  );
}

function TextInput({ label, helper, ...props }) {
  return (
    <div>
      <label className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-600 dark:text-gray-400">
        {label}
      </label>
      <input
        {...props}
        className={`w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:placeholder:text-gray-500 dark:focus:border-primary-500 dark:disabled:bg-dark-900/50 dark:disabled:text-gray-500 ${props.className || ''}`}
      />
      {helper && (
        <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
          {helper}
        </p>
      )}
    </div>
  );
}

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

  // User profile photo
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [savedPhotoUrl, setSavedPhotoUrl] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Motorcycle photo
  const [motoPhotoFile, setMotoPhotoFile] = useState(null);
  const [motoPhotoPreview, setMotoPhotoPreview] = useState(null);
  const [savedMotoPhotoUrl, setSavedMotoPhotoUrl] = useState(null);
  const [uploadingMotoPhoto, setUploadingMotoPhoto] = useState(false);

  // Remove photo states
  const [removingPhoto, setRemovingPhoto] = useState(false);
  const [removingMotoPhoto, setRemovingMotoPhoto] = useState(false);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [certificates, setCertificates] = useState([]);
  const [loadingCerts, setLoadingCerts] = useState(false);

  const [certName, setCertName] = useState('');
  const [certFile, setCertFile] = useState(null);
  const [uploadingCert, setUploadingCert] = useState(false);
  const [certError, setCertError] = useState('');
  const [certSuccess, setCertSuccess] = useState('');
  const [deletingCertId, setDeletingCertId] = useState(null);

  const [previewCert, setPreviewCert] = useState(null);

  useEffect(() => {
    if (!profile) return;

    setForm({
      first_name: profile.first_name || '',
      last_name: profile.last_name || '',
      phone: profile.phone || '',
      moto_make: profile.moto_make || '',
      moto_model: profile.moto_model || '',
      moto_year: profile.moto_year || '',
      specialization: profile.specialization || '',
    });

    setSavedPhotoUrl(profile.profile_photo_url || null);
    setPhotoPreview(profile.profile_photo_url || null);

    setSavedMotoPhotoUrl(profile.moto_photo_url || null);
    setMotoPhotoPreview(profile.moto_photo_url || null);

    if (profile.role === 'mechanic') {
      fetchCertificates(profile.id);
    }
  }, [profile]);

  useEffect(() => {
    return () => {
      if (photoPreview?.startsWith('blob:')) {
        URL.revokeObjectURL(photoPreview);
      }
    };
  }, [photoPreview]);

  useEffect(() => {
    return () => {
      if (motoPhotoPreview?.startsWith('blob:')) {
        URL.revokeObjectURL(motoPhotoPreview);
      }
    };
  }, [motoPhotoPreview]);

  async function fetchCertificates(mechanicId) {
    setLoadingCerts(true);

    const { data, error } = await supabase
      .from('mechanic_certificates')
      .select('*')
      .eq('mechanic_id', mechanicId)
      .order('created_at', { ascending: false });

    if (!error && data) setCertificates(data);

    setLoadingCerts(false);
  }

  function handleChange(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  function validateImageFile(file, label) {
    if (!file.type.startsWith('image/')) {
      setError(`Please choose a valid image file for ${label}.`);
      return false;
    }

    if (!isValidFileSize(file, MAX_PHOTO_SIZE_MB)) {
      setError(`${label} must be ${MAX_PHOTO_SIZE_MB}MB or smaller.`);
      return false;
    }

    return true;
  }

  function handlePhotoChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setMessage('');
    setError('');

    if (!validateImageFile(file, 'profile photo')) return;

    if (photoPreview?.startsWith('blob:')) {
      URL.revokeObjectURL(photoPreview);
    }

    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  function handleMotoPhotoChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setMessage('');
    setError('');

    if (!validateImageFile(file, 'motorcycle photo')) return;

    if (motoPhotoPreview?.startsWith('blob:')) {
      URL.revokeObjectURL(motoPhotoPreview);
    }

    setMotoPhotoFile(file);
    setMotoPhotoPreview(URL.createObjectURL(file));
  }

  async function uploadImageFile(file, folder, filePrefix) {
    const fileExt = file.name.split('.').pop();
    const filePath = `${user.id}/${folder}/${filePrefix}_${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('motorcycle-photos')
      .upload(filePath, file, { upsert: true });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage
      .from('motorcycle-photos')
      .getPublicUrl(filePath);

    return urlData.publicUrl;
  }

  function getStoragePathFromPublicUrl(publicUrl, bucket = 'motorcycle-photos') {
    if (!publicUrl) return null;

    const marker = `/object/public/${bucket}/`;
    const markerIndex = publicUrl.indexOf(marker);

    if (markerIndex === -1) return null;

    const pathWithQuery = publicUrl.slice(markerIndex + marker.length);
    const pathOnly = pathWithQuery.split('?')[0];

    try {
      return decodeURIComponent(pathOnly);
    } catch {
      return pathOnly;
    }
  }

  async function removeFileFromStorage(publicUrl) {
    const filePath = getStoragePathFromPublicUrl(publicUrl);

    if (!filePath) return;

    const { error } = await supabase.storage
      .from('motorcycle-photos')
      .remove([filePath]);

    /*
      Do not block the database update if Storage delete fails.
      The important part for the UI is setting the profile column to null.
    */
    if (error) {
      console.warn('Storage delete failed:', error.message);
    }
  }

  async function handleRemoveProfilePhoto() {
    if (!photoFile && !savedPhotoUrl && !profile?.profile_photo_url) return;
    if (!confirm('Remove your profile picture?')) return;

    setMessage('');
    setError('');
    setRemovingPhoto(true);

    try {
      const currentPhotoUrl = savedPhotoUrl || profile?.profile_photo_url;

      if (currentPhotoUrl) {
        await removeFileFromStorage(currentPhotoUrl);

        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            profile_photo_url: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', user.id);

        if (updateError) throw updateError;

        await refreshProfile();
      }

      if (photoPreview?.startsWith('blob:')) {
        URL.revokeObjectURL(photoPreview);
      }

      setPhotoFile(null);
      setPhotoPreview(null);
      setSavedPhotoUrl(null);
      setMessage('Profile picture removed successfully!');
    } catch (err) {
      setError(err.message || 'Failed to remove profile picture.');
    } finally {
      setRemovingPhoto(false);
    }
  }

  async function handleRemoveMotoPhoto() {
    if (!motoPhotoFile && !savedMotoPhotoUrl && !profile?.moto_photo_url) return;
    if (!confirm('Remove your motorcycle picture?')) return;

    setMessage('');
    setError('');
    setRemovingMotoPhoto(true);

    try {
      const currentMotoPhotoUrl = savedMotoPhotoUrl || profile?.moto_photo_url;

      if (currentMotoPhotoUrl) {
        await removeFileFromStorage(currentMotoPhotoUrl);

        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            moto_photo_url: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', user.id);

        if (updateError) throw updateError;

        await refreshProfile();
      }

      if (motoPhotoPreview?.startsWith('blob:')) {
        URL.revokeObjectURL(motoPhotoPreview);
      }

      setMotoPhotoFile(null);
      setMotoPhotoPreview(null);
      setSavedMotoPhotoUrl(null);
      setMessage('Motorcycle picture removed successfully!');
    } catch (err) {
      setError(err.message || 'Failed to remove motorcycle picture.');
    } finally {
      setRemovingMotoPhoto(false);
    }
  }

  async function handlePhotoUpload() {
    if (!photoFile) return null;

    setUploadingPhoto(true);

    try {
      return await uploadImageFile(photoFile, 'profile-photos', 'profile');
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleMotoPhotoUpload() {
    if (!motoPhotoFile) return null;

    setUploadingMotoPhoto(true);

    try {
      return await uploadImageFile(motoPhotoFile, 'motorcycle-photos', 'motorcycle');
    } finally {
      setUploadingMotoPhoto(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setMessage('');
    setError('');
    setSaving(true);

    try {
      let newPhotoUrl = null;
      let newMotoPhotoUrl = null;

      if (photoFile) {
        newPhotoUrl = await handlePhotoUpload();
      }

      if (!isMechanic && motoPhotoFile) {
        newMotoPhotoUrl = await handleMotoPhotoUpload();
      }

      const updatePayload = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone: form.phone.trim() || null,
        updated_at: new Date().toISOString(),
      };

      if (newPhotoUrl) updatePayload.profile_photo_url = newPhotoUrl;

      if (profile?.role === 'mechanic') {
        updatePayload.specialization = form.specialization.trim() || null;
      } else {
        updatePayload.moto_make = form.moto_make.trim() || null;
        updatePayload.moto_model = form.moto_model.trim() || null;
        updatePayload.moto_year = form.moto_year ? parseInt(form.moto_year, 10) : null;
        if (newMotoPhotoUrl) updatePayload.moto_photo_url = newMotoPhotoUrl;
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update(updatePayload)
        .eq('id', user.id);

      if (updateError) throw updateError;

      await refreshProfile();

      if (newPhotoUrl) setSavedPhotoUrl(newPhotoUrl);
      if (newMotoPhotoUrl) setSavedMotoPhotoUrl(newMotoPhotoUrl);

      setPhotoFile(null);
      setMotoPhotoFile(null);
      setMessage('Profile updated successfully!');
    } catch (err) {
      setError(err.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  }

  function handleCertFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setCertError('');
    setCertSuccess('');

    const validType = file.type.startsWith('image/') || file.type === 'application/pdf';

    if (!validType) {
      setCertError('Please upload an image or PDF certificate.');
      return;
    }

    if (!isValidFileSize(file, MAX_CERT_SIZE_MB)) {
      setCertError(`Certificate file must be ${MAX_CERT_SIZE_MB}MB or smaller.`);
      return;
    }

    setCertFile(file);

    if (!certName) {
      setCertName(file.name.replace(/\.[^/.]+$/, ''));
    }
  }

  async function handleUploadCertificate(event) {
    event.preventDefault();

    setCertError('');
    setCertSuccess('');

    if (!certName.trim()) {
      setCertError('Please enter a certificate name.');
      return;
    }

    if (!certFile) {
      setCertError('Please choose a file to upload.');
      return;
    }

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
      setCertError(err.message || 'Failed to upload certificate.');
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

  const displayPhoto = photoPreview || savedPhotoUrl;
  const displayMotoPhoto = motoPhotoPreview || savedMotoPhotoUrl;
  const isMechanic = profile?.role === 'mechanic';

  const fullName = useMemo(() => {
    const value = `${form.first_name || ''} ${form.last_name || ''}`.trim();
    return value || 'Your Profile';
  }, [form.first_name, form.last_name]);

  const motorcycleLabel = useMemo(() => {
    const value = `${form.moto_make || ''} ${form.moto_model || ''}`.trim();
    if (!value && !form.moto_year) return 'Not set';
    return `${value}${form.moto_year ? ` (${form.moto_year})` : ''}`.trim();
  }, [form.moto_make, form.moto_model, form.moto_year]);

  return (
    <div className="min-h-[calc(100vh-72px)] bg-gray-50 px-4 py-8 text-gray-900 dark:bg-dark-900 dark:text-white sm:px-6 lg:py-10">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8 overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-dark-700 dark:bg-dark-800">
          <div className="relative p-6 sm:p-8">
            <div className="absolute -right-8 -top-14 h-36 w-36 rounded-full bg-primary-500/10 blur-3xl" />
            <div className="absolute -bottom-16 left-10 h-36 w-36 rounded-full bg-accent-500/10 blur-3xl" />

            <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="flex min-w-0 items-center gap-4">
                <div className="relative flex-shrink-0">
                  {displayPhoto ? (
                    <img
                      src={displayPhoto}
                      alt="Profile"
                      className="h-20 w-20 rounded-3xl border-2 border-primary-100 object-cover shadow-sm dark:border-primary-500/30"
                    />
                  ) : (
                    <div className="grid h-20 w-20 place-items-center rounded-3xl bg-primary-600 text-2xl font-black text-white shadow-sm">
                      {getInitials(form.first_name, form.last_name)}
                    </div>
                  )}
                </div>

                <div className="min-w-0">
                  <p className="mb-2 text-xs font-black uppercase tracking-[0.25em] text-primary-600 dark:text-primary-400">
                    MotoFix Profile
                  </p>
                  <h1 className="truncate text-3xl font-black tracking-tight text-gray-950 dark:text-white md:text-4xl">
                    {fullName}
                  </h1>
                  <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">
                    Manage your personal details, account information, and profile photos.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:flex">
                <div className="rounded-2xl bg-gray-50 px-4 py-3 text-center ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                  <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Role
                  </p>
                  <p className="text-lg font-black capitalize text-primary-600 dark:text-primary-400">
                    {profile?.role || 'customer'}
                  </p>
                </div>
                <div className="rounded-2xl bg-gray-50 px-4 py-3 text-center ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                  <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    {isMechanic ? 'Certificates' : 'Motorcycle'}
                  </p>
                  <p className="max-w-36 truncate text-lg font-black text-gray-950 dark:text-white">
                    {isMechanic ? certificates.length : motorcycleLabel}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {message && <Notice type="success">✓ {message}</Notice>}
        {error && <Notice type="error">⚠ {error}</Notice>}

        <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[360px_1fr]">
          {/* Left column */}
          <div className="space-y-6">
            <SectionCard
              title="Profile Picture"
              description="This photo is shown on bookings, mechanic listings, and account menus."
              icon="📷"
            >
              <div className="flex flex-col items-center text-center">
                <div className="relative mb-5">
                  {displayPhoto ? (
                    <img
                      src={displayPhoto}
                      alt="Profile"
                      className="h-36 w-36 rounded-[2rem] border-4 border-white object-cover shadow-xl ring-1 ring-gray-200 dark:border-dark-800 dark:ring-dark-700"
                    />
                  ) : (
                    <div className="grid h-36 w-36 place-items-center rounded-[2rem] border-4 border-white bg-primary-600 text-4xl font-black text-white shadow-xl ring-1 ring-gray-200 dark:border-dark-800 dark:ring-dark-700">
                      {getInitials(form.first_name, form.last_name)}
                    </div>
                  )}

                  <label
                    htmlFor="photo-upload"
                    className="absolute -bottom-2 -right-2 grid h-11 w-11 cursor-pointer place-items-center rounded-2xl bg-primary-600 text-white shadow-lg transition hover:bg-primary-700"
                    title="Change photo"
                  >
                    📷
                  </label>
                </div>

                <input
                  id="photo-upload"
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoChange}
                  className="hidden"
                />

                <div className="flex flex-wrap justify-center gap-2">
                  <label
                    htmlFor="photo-upload"
                    className="cursor-pointer rounded-2xl border border-gray-200 bg-gray-50 px-5 py-3 text-sm font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:bg-dark-900 dark:text-gray-300 dark:hover:border-primary-500/40 dark:hover:text-primary-400"
                  >
                    {photoFile ? 'Change Selected Photo' : 'Upload Photo'}
                  </label>

                  {(displayPhoto || photoFile) && (
                    <button
                      type="button"
                      onClick={handleRemoveProfilePhoto}
                      disabled={removingPhoto}
                      className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-black text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20"
                    >
                      {removingPhoto ? 'Removing...' : 'Remove Photo'}
                    </button>
                  )}
                </div>

                <p className="mt-3 text-xs leading-5 text-gray-500 dark:text-gray-400">
                  JPG, PNG, or WebP. Max {MAX_PHOTO_SIZE_MB}MB.
                </p>

                {photoFile && (
                  <p className="mt-3 rounded-2xl bg-green-50 px-4 py-3 text-xs font-bold text-green-700 ring-1 ring-green-100 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/20">
                    ✓ {photoFile.name} selected — save to apply.
                  </p>
                )}
              </div>
            </SectionCard>

            {!isMechanic && (
              <SectionCard
                title="Motorcycle Picture"
                description="This photo is shown on your Dashboard motorcycle card."
                icon="🏍️"
              >
                <div className="flex flex-col items-center text-center">
                  <div className="relative mb-5 w-full">
                    <div className="overflow-hidden rounded-[2rem] border-4 border-white bg-gray-50 shadow-xl ring-1 ring-gray-200 dark:border-dark-800 dark:bg-dark-900 dark:ring-dark-700">
                      {displayMotoPhoto ? (
                        <img
                          src={displayMotoPhoto}
                          alt="My motorcycle"
                          className="h-48 w-full object-cover"
                        />
                      ) : (
                        <div className="grid h-48 w-full place-items-center text-5xl text-gray-400">
                          🏍️
                        </div>
                      )}
                    </div>

                    <label
                      htmlFor="moto-photo-upload"
                      className="absolute -bottom-2 -right-2 grid h-11 w-11 cursor-pointer place-items-center rounded-2xl bg-primary-600 text-white shadow-lg transition hover:bg-primary-700"
                      title="Change motorcycle photo"
                    >
                      📷
                    </label>
                  </div>

                  <input
                    id="moto-photo-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleMotoPhotoChange}
                    className="hidden"
                  />

                  <div className="flex flex-wrap justify-center gap-2">
                    <label
                      htmlFor="moto-photo-upload"
                      className="cursor-pointer rounded-2xl border border-gray-200 bg-gray-50 px-5 py-3 text-sm font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:bg-dark-900 dark:text-gray-300 dark:hover:border-primary-500/40 dark:hover:text-primary-400"
                    >
                      {motoPhotoFile ? 'Change Motorcycle Photo' : 'Upload Motorcycle Photo'}
                    </label>

                    {(displayMotoPhoto || motoPhotoFile) && (
                      <button
                        type="button"
                        onClick={handleRemoveMotoPhoto}
                        disabled={removingMotoPhoto}
                        className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-black text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20"
                      >
                        {removingMotoPhoto ? 'Removing...' : 'Remove Motorcycle Photo'}
                      </button>
                    )}
                  </div>

                  <p className="mt-3 text-xs leading-5 text-gray-500 dark:text-gray-400">
                    This saves to <span className="font-bold">profiles.moto_photo_url</span>.
                  </p>

                  {motoPhotoFile && (
                    <p className="mt-3 rounded-2xl bg-green-50 px-4 py-3 text-xs font-bold text-green-700 ring-1 ring-green-100 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/20">
                      ✓ {motoPhotoFile.name} selected — save to apply.
                    </p>
                  )}
                </div>
              </SectionCard>
            )}

            <SectionCard
              title="Account Summary"
              description="A quick view of your saved account details."
              icon="👤"
            >
              <div className="space-y-3">
                <div className="rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                  <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Email
                  </p>
                  <p className="mt-1 truncate text-sm font-bold text-gray-950 dark:text-white">
                    {profile?.email || user?.email || 'No email'}
                  </p>
                </div>

                <div className="rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                  <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Phone
                  </p>
                  <p className="mt-1 truncate text-sm font-bold text-gray-950 dark:text-white">
                    {form.phone || 'No phone on file'}
                  </p>
                </div>

                <div className="rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                  <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Role
                  </p>
                  <p className="mt-1 text-sm font-black capitalize text-primary-600 dark:text-primary-400">
                    {profile?.role || 'customer'}
                  </p>
                </div>
              </div>
            </SectionCard>
          </div>

          {/* Right column */}
          <div className="space-y-6">
            <SectionCard
              title="Account Information"
              description="Update your name and contact number."
              icon="📝"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <TextInput
                  label="First Name"
                  name="first_name"
                  value={form.first_name}
                  onChange={handleChange}
                  placeholder="First name"
                  required
                />

                <TextInput
                  label="Last Name"
                  name="last_name"
                  value={form.last_name}
                  onChange={handleChange}
                  placeholder="Last name"
                  required
                />

                <TextInput
                  label="Email"
                  value={profile?.email || user?.email || ''}
                  disabled
                  helper="Email cannot be changed here."
                />

                <TextInput
                  label="Phone"
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  placeholder="09XX XXX XXXX"
                />
              </div>
            </SectionCard>

            {!isMechanic && (
              <SectionCard
                title="My Motorcycle"
                description="This helps MotoFix suggest compatible parts and services."
                icon="🏍️"
              >
                <div className="grid gap-4 md:grid-cols-3">
                  <TextInput
                    label="Make"
                    name="moto_make"
                    value={form.moto_make}
                    onChange={handleChange}
                    placeholder="e.g. Yamaha"
                  />

                  <TextInput
                    label="Model"
                    name="moto_model"
                    value={form.moto_model}
                    onChange={handleChange}
                    placeholder="e.g. Aerox 155"
                  />

                  <TextInput
                    label="Year"
                    type="number"
                    name="moto_year"
                    value={form.moto_year}
                    onChange={handleChange}
                    placeholder="e.g. 2023"
                    min="1950"
                    max={new Date().getFullYear() + 1}
                  />
                </div>
              </SectionCard>
            )}

            {isMechanic && (
              <>
                <SectionCard
                  title="Mechanic Profile"
                  description="Your specialization appears on the public mechanics page."
                  icon="🔧"
                >
                  <TextInput
                    label="Specialization"
                    name="specialization"
                    value={form.specialization}
                    onChange={handleChange}
                    placeholder="e.g. Engine Repair, Electrical, General Maintenance"
                  />
                </SectionCard>

                <SectionCard
                  title="My Certificates"
                  description="Upload certifications and credentials for your mechanic profile."
                  icon="🎓"
                >
                  {certError && (
                    <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                      {certError}
                    </div>
                  )}

                  {certSuccess && (
                    <div className="mb-4 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-semibold text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300">
                      {certSuccess}
                    </div>
                  )}

                  <div className="mb-5 rounded-3xl border border-gray-100 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900/70">
                    <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
                      <TextInput
                        label="Certificate Name"
                        type="text"
                        value={certName}
                        onChange={(event) => setCertName(event.target.value)}
                        placeholder="e.g. TESDA NC II"
                      />

                      <div>
                        <label className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-600 dark:text-gray-400">
                          File
                        </label>
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          onChange={handleCertFileChange}
                          className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-xs font-semibold text-gray-600 file:mr-3 file:rounded-xl file:border-0 file:bg-primary-600 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-white hover:file:bg-primary-700 dark:border-dark-700 dark:bg-dark-800 dark:text-gray-400"
                        />
                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                          Image or PDF. Max {MAX_CERT_SIZE_MB}MB.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={handleUploadCertificate}
                        disabled={uploadingCert}
                        className="rounded-2xl bg-primary-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {uploadingCert ? 'Uploading...' : '+ Upload'}
                      </button>
                    </div>

                    {certFile && (
                      <p className="mt-3 rounded-2xl bg-primary-50 px-4 py-3 text-xs font-bold text-primary-700 ring-1 ring-primary-100 dark:bg-primary-500/10 dark:text-primary-400 dark:ring-primary-500/20">
                        Selected: {certFile.name}
                      </p>
                    )}
                  </div>

                  {loadingCerts ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {[1, 2].map((item) => (
                        <div
                          key={item}
                          className="h-24 animate-pulse rounded-3xl bg-gray-100 dark:bg-dark-900"
                        />
                      ))}
                    </div>
                  ) : certificates.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center dark:border-dark-700 dark:bg-dark-900/60">
                      <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                        No certificates uploaded yet.
                      </p>
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {certificates.map((certificate) => {
                        const image = isImageFile(certificate.file_url);

                        return (
                          <article
                            key={certificate.id}
                            className="rounded-3xl border border-gray-200 bg-gray-50 p-3 dark:border-dark-700 dark:bg-dark-900/60"
                          >
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => setPreviewCert(certificate)}
                                className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-2xl bg-white ring-1 ring-gray-200 dark:bg-dark-800 dark:ring-dark-700"
                              >
                                {image ? (
                                  <img
                                    src={certificate.file_url}
                                    alt={certificate.name}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <div className="grid h-full w-full place-items-center text-2xl text-gray-400">
                                    📄
                                  </div>
                                )}
                              </button>

                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-black text-gray-950 dark:text-white">
                                  {certificate.name}
                                </p>
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                  Uploaded {formatDate(certificate.created_at)}
                                </p>
                                <p className="mt-1 text-xs font-bold text-gray-500 dark:text-gray-400">
                                  {image ? 'Image certificate' : 'PDF/File certificate'}
                                </p>
                              </div>
                            </div>

                            <div className="mt-3 flex gap-2">
                              <button
                                type="button"
                                onClick={() => setPreviewCert(certificate)}
                                className="flex-1 rounded-2xl border border-primary-100 bg-primary-50 px-3 py-2 text-xs font-black text-primary-700 transition hover:bg-primary-100 dark:border-primary-500/25 dark:bg-primary-500/10 dark:text-primary-400 dark:hover:bg-primary-500/20"
                              >
                                View
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeleteCertificate(certificate)}
                                disabled={deletingCertId === certificate.id}
                                className="flex-1 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20"
                              >
                                {deletingCertId === certificate.id ? 'Deleting...' : 'Delete'}
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </SectionCard>
              </>
            )}

            <button
              type="submit"
              disabled={saving || uploadingPhoto || uploadingMotoPhoto || removingPhoto || removingMotoPhoto}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-primary-600/25 transition hover:bg-primary-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {(saving || uploadingPhoto || uploadingMotoPhoto || removingPhoto || removingMotoPhoto) && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              )}
              {saving || uploadingPhoto || uploadingMotoPhoto || removingPhoto || removingMotoPhoto ? 'Saving Changes...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>

      {/* Certificate preview */}
      {previewCert && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 px-4 backdrop-blur-md"
          onClick={() => setPreviewCert(null)}
        >
          <button
            type="button"
            onClick={() => setPreviewCert(null)}
            className="absolute right-5 top-5 grid h-11 w-11 place-items-center rounded-2xl bg-white/10 text-2xl leading-none text-white transition hover:bg-white/20"
          >
            ✕
          </button>

          <div
            className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-dark-900"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4 border-b border-gray-200 px-5 py-4 dark:border-dark-700">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-gray-950 dark:text-white">
                  {previewCert.name || 'Certificate'}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Certificate preview
                </p>
              </div>

              <a
                href={previewCert.file_url}
                target="_blank"
                rel="noreferrer"
                className="flex-shrink-0 rounded-2xl bg-primary-600 px-4 py-2 text-xs font-black text-white transition hover:bg-primary-700"
              >
                Open File
              </a>
            </div>

            <div className="flex max-h-[calc(90vh-72px)] items-center justify-center bg-gray-100 p-4 dark:bg-black">
              {isImageFile(previewCert.file_url) ? (
                <img
                  src={previewCert.file_url}
                  alt={previewCert.name || 'Certificate'}
                  className="max-h-[calc(90vh-104px)] max-w-full rounded-2xl object-contain"
                />
              ) : (
                <iframe
                  src={previewCert.file_url}
                  title={previewCert.name || 'Certificate'}
                  className="h-[75vh] w-full rounded-2xl border-0 bg-white"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
