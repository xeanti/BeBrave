import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';

const EMPTY_FORM = {
  id: null,
  category: 'general',
  intent: '',
  title: '',
  question: '',
  answer: '',
  response: '',
  keywordsText: '',
  priority: '100',
  is_active: true,
};

const CATEGORIES = [
  'general',
  'booking',
  'payment',
  'orders',
  'customization',
  'parts',
  'pre-assessment',
];

function formatDateTime(value) {
  if (!value) return '—';

  return new Date(value).toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function normalizeIntent(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function keywordsToText(keywords) {
  if (Array.isArray(keywords)) return keywords.join(', ');
  if (typeof keywords === 'string') return keywords;
  return '';
}

function textToKeywords(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function StatCard({ label, value, icon, tone = 'default' }) {
  const tones = {
    default: 'text-gray-950 dark:text-white',
    primary: 'text-primary-600 dark:text-primary-400',
    accent: 'text-accent-600 dark:text-accent-400',
    green: 'text-green-600 dark:text-green-300',
    red: 'text-red-600 dark:text-red-300',
  };

  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-700 dark:bg-dark-800">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {label}
        </p>
        <span className="text-2xl">{icon}</span>
      </div>

      <p className={`text-2xl font-black ${tones[tone] || tones.default}`}>
        {value}
      </p>
    </div>
  );
}

function StatusBadge({ active }) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-black ring-1 ${
        active
          ? 'bg-green-50 text-green-700 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25'
          : 'bg-gray-100 text-gray-600 ring-gray-200 dark:bg-gray-500/10 dark:text-gray-400 dark:ring-gray-500/25'
      }`}
    >
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

export default function AdminChatbotTemplates() {
  const { user } = useAuth();

  const [templates, setTemplates] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formOpen, setFormOpen] = useState(false);

  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    fetchTemplates();

    const channel = supabase
      .channel('admin-chatbot-templates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chatbot_templates',
        },
        () => fetchTemplates(false)
      )
      .subscribe();

    const handleFocus = () => fetchTemplates(false);

    const handleVisibilityChange = () => {
      if (!document.hidden) fetchTemplates(false);
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const stats = useMemo(() => {
    return {
      total: templates.length,
      active: templates.filter((item) => item.is_active).length,
      inactive: templates.filter((item) => !item.is_active).length,
      categories: new Set(templates.map((item) => item.category || 'general')).size,
    };
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    const query = search.trim().toLowerCase();

    return templates.filter((template) => {
      const category = String(template.category || 'general').toLowerCase();

      if (filter !== 'all' && category !== filter) return false;

      if (!query) return true;

      const keywords = keywordsToText(template.keywords).toLowerCase();

      return (
        String(template.intent || '').toLowerCase().includes(query) ||
        String(template.title || '').toLowerCase().includes(query) ||
        String(template.question || '').toLowerCase().includes(query) ||
        String(template.answer || '').toLowerCase().includes(query) ||
        String(template.response || '').toLowerCase().includes(query) ||
        keywords.includes(query)
      );
    });
  }, [templates, filter, search]);

  async function fetchTemplates(showLoader = true) {
    if (showLoader) setLoading(true);

    setMessage('');
    setMessageType('');

    const { data, error } = await supabase
      .from('chatbot_templates')
      .select('*')
      .order('priority', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      setTemplates([]);
      setMessage(error.message || 'Failed to load chatbot templates.');
      setMessageType('error');
      setLoading(false);
      return;
    }

    setTemplates(data || []);
    setLastUpdated(new Date());
    setLoading(false);
  }

  function openAddForm() {
    setForm(EMPTY_FORM);
    setFormOpen(true);
    setMessage('');
    setMessageType('');
  }

  function openEditForm(template) {
    setForm({
      id: template.id,
      category: template.category || 'general',
      intent: template.intent || '',
      title: template.title || '',
      question: template.question || template.title || '',
      answer: template.answer || template.response || '',
      response: template.response || template.answer || '',
      keywordsText: keywordsToText(template.keywords),
      priority: String(template.priority ?? 100),
      is_active: Boolean(template.is_active),
    });

    setFormOpen(true);
    setMessage('');
    setMessageType('');
  }

  function closeForm() {
    setForm(EMPTY_FORM);
    setFormOpen(false);
    setSaving(false);
  }

  function updateForm(key, value) {
    setForm((current) => {
      const next = {
        ...current,
        [key]: value,
      };

      if (key === 'intent') {
        next.intent = normalizeIntent(value);
      }

      if (key === 'title' && !current.question) {
        next.question = value;
      }

      if (key === 'question' && !current.title) {
        next.title = value;
      }

      if (key === 'answer') {
        next.response = value;
      }

      return next;
    });
  }

  function validateForm() {
    const title = form.title.trim() || form.question.trim();
    const question = form.question.trim() || form.title.trim();
    const answer = form.answer.trim() || form.response.trim();
    const response = form.response.trim() || form.answer.trim();
    const intent = normalizeIntent(form.intent || title);

    if (!intent) return 'Intent / key is required.';
    if (!title) return 'Title is required.';
    if (!question) return 'Customer question is required.';
    if (!answer || !response) return 'Chatbot answer is required.';

    return '';
  }

  function buildPayload() {
    const title = form.title.trim() || form.question.trim();
    const question = form.question.trim() || form.title.trim();
    const answer = form.answer.trim() || form.response.trim();
    const response = form.response.trim() || form.answer.trim();

    return {
      category: form.category || 'general',
      intent: normalizeIntent(form.intent || title),
      title,
      question,
      answer,
      response,
      keywords: textToKeywords(form.keywordsText),
      priority: Number(form.priority) || 100,
      is_active: Boolean(form.is_active),
    };
  }

  async function insertAuditLog(action, entityId, details = {}) {
    if (!user?.id) return;

    await supabase.from('audit_logs').insert({
      action,
      entity: 'chatbot_templates',
      entity_id: entityId,
      performed_by: user.id,
      details,
    });
  }

  async function handleSave(event) {
    event.preventDefault();

    const validation = validateForm();

    if (validation) {
      setMessage(validation);
      setMessageType('error');
      return;
    }

    const payload = buildPayload();

    setSaving(true);
    setMessage('');
    setMessageType('');

    try {
      if (form.id) {
        const { error } = await supabase
          .from('chatbot_templates')
          .update({
            ...payload,
            updated_by: user?.id || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', form.id);

        if (error) throw error;

        await insertAuditLog('UPDATE_CHATBOT_TEMPLATE', form.id, {
          intent: payload.intent,
          title: payload.title,
        });

        setMessage('Chatbot template updated successfully.');
      } else {
        const { data, error } = await supabase
          .from('chatbot_templates')
          .insert({
            ...payload,
            created_by: user?.id || null,
            updated_by: user?.id || null,
          })
          .select()
          .single();

        if (error) throw error;

        await insertAuditLog('CREATE_CHATBOT_TEMPLATE', data?.id, {
          intent: payload.intent,
          title: payload.title,
        });

        setMessage('Chatbot template created successfully.');
      }

      setMessageType('success');
      closeForm();
      await fetchTemplates(false);
    } catch (err) {
      setMessage(err.message || 'Failed to save chatbot template.');
      setMessageType('error');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(template) {
    const nextValue = !template.is_active;

    try {
      const { error } = await supabase
        .from('chatbot_templates')
        .update({
          is_active: nextValue,
          updated_by: user?.id || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', template.id);

      if (error) throw error;

      await insertAuditLog('TOGGLE_CHATBOT_TEMPLATE', template.id, {
        intent: template.intent,
        is_active: nextValue,
      });

      setTemplates((current) =>
        current.map((item) =>
          item.id === template.id ? { ...item, is_active: nextValue } : item
        )
      );

      setMessage(`Template ${nextValue ? 'enabled' : 'disabled'} successfully.`);
      setMessageType('success');
    } catch (err) {
      setMessage(err.message || 'Failed to update template.');
      setMessageType('error');
    }
  }

  async function deleteTemplate(template) {
    const confirmed = window.confirm(
      `Delete "${template.title || template.intent}"? This cannot be undone.`
    );

    if (!confirmed) return;

    setDeletingId(template.id);
    setMessage('');
    setMessageType('');

    try {
      const { error } = await supabase
        .from('chatbot_templates')
        .delete()
        .eq('id', template.id);

      if (error) throw error;

      await insertAuditLog('DELETE_CHATBOT_TEMPLATE', template.id, {
        intent: template.intent,
        title: template.title,
      });

      setTemplates((current) => current.filter((item) => item.id !== template.id));
      setMessage('Chatbot template deleted successfully.');
      setMessageType('success');
    } catch (err) {
      setMessage(err.message || 'Failed to delete template.');
      setMessageType('error');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gray-50 px-4 py-8 text-gray-900 dark:bg-dark-900 dark:text-white sm:px-6 lg:py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-dark-700 dark:bg-dark-800">
          <div className="relative p-6 sm:p-8">
            <div className="absolute -right-8 -top-14 h-36 w-36 rounded-full bg-primary-500/10 blur-3xl" />
            <div className="absolute -bottom-16 left-10 h-36 w-36 rounded-full bg-accent-500/10 blur-3xl" />

            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="mb-2 text-xs font-black uppercase tracking-[0.25em] text-primary-600 dark:text-primary-400">
                  MotoFix Admin
                </p>

                <h1 className="text-3xl font-black tracking-tight text-gray-950 dark:text-white md:text-4xl">
                  Chatbot Templates
                </h1>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-400">
                  Manage AI Assistant answers for bookings, payments, orders, parts, customization, and customer FAQs.
                </p>

                {lastUpdated && (
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Last updated: {formatDateTime(lastUpdated)}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => fetchTemplates(false)}
                  className="inline-flex items-center justify-center rounded-2xl border border-gray-200 px-5 py-3 text-sm font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300 dark:hover:border-primary-500 dark:hover:text-primary-400"
                >
                  Refresh
                </button>

                <button
                  type="button"
                  onClick={openAddForm}
                  className="inline-flex items-center justify-center rounded-2xl bg-primary-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700"
                >
                  + Add Template
                </button>
              </div>
            </div>
          </div>
        </div>

        {message && (
          <div
            className={`mb-6 rounded-2xl border p-4 text-sm font-semibold ${
              messageType === 'success'
                ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300'
                : 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300'
            }`}
          >
            {message}
          </div>
        )}

        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total Templates" value={stats.total} icon="🤖" tone="primary" />
          <StatCard label="Active" value={stats.active} icon="✅" tone="green" />
          <StatCard label="Inactive" value={stats.inactive} icon="⏸️" />
          <StatCard label="Categories" value={stats.categories} icon="🏷️" tone="accent" />
        </div>

        {formOpen && (
          <form
            onSubmit={handleSave}
            className="mb-6 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-700 dark:bg-dark-800 sm:p-6"
          >
            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-black text-gray-950 dark:text-white">
                  {form.id ? 'Edit Template' : 'Add Template'}
                </h2>

                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  This saves both web fields and mobile-friendly fields.
                </p>
              </div>

              <button
                type="button"
                onClick={closeForm}
                className="rounded-2xl border border-gray-200 px-4 py-2 text-sm font-black text-gray-600 transition hover:bg-gray-100 dark:border-dark-700 dark:text-gray-300 dark:hover:bg-dark-700"
              >
                Close
              </button>
            </div>

            <div className="mb-5">
              <label className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Category
              </label>

              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => updateForm('category', category)}
                    className={`rounded-full px-4 py-2 text-xs font-black capitalize transition ${
                      form.category === category
                        ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 dark:bg-dark-900 dark:text-gray-400 dark:hover:bg-dark-700 dark:hover:text-white'
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Intent / Key
                </label>
                <input
                  type="text"
                  value={form.intent}
                  onChange={(event) => updateForm('intent', event.target.value)}
                  placeholder="booking_service"
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:placeholder:text-gray-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Priority
                </label>
                <input
                  type="number"
                  min="1"
                  value={form.priority}
                  onChange={(event) => updateForm('priority', event.target.value)}
                  placeholder="100"
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:placeholder:text-gray-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Title
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(event) => updateForm('title', event.target.value)}
                  placeholder="How to Book a Service"
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:placeholder:text-gray-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Customer Question
                </label>
                <input
                  type="text"
                  value={form.question}
                  onChange={(event) => updateForm('question', event.target.value)}
                  placeholder="How do I book a service?"
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:placeholder:text-gray-500"
                />
              </div>

              <div className="lg:col-span-2">
                <label className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Chatbot Answer
                </label>
                <textarea
                  value={form.answer}
                  onChange={(event) => updateForm('answer', event.target.value)}
                  placeholder="Write the response shown by the chatbot..."
                  rows={5}
                  className="w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold leading-6 text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:placeholder:text-gray-500"
                />
              </div>

              <div className="lg:col-span-2">
                <label className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Keywords
                </label>
                <input
                  type="text"
                  value={form.keywordsText}
                  onChange={(event) => updateForm('keywordsText', event.target.value)}
                  placeholder="booking, appointment, schedule"
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:placeholder:text-gray-500"
                />
                <p className="mt-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
                  Separate keywords using commas. The Edge Function matches these words before using Gemini.
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3 rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-black text-gray-950 dark:text-white">
                  Active Template
                </p>
                <p className="mt-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
                  Active templates can be used by the AI Assistant.
                </p>
              </div>

              <button
                type="button"
                onClick={() => updateForm('is_active', !form.is_active)}
                className={`rounded-full px-4 py-2 text-xs font-black transition ${
                  form.is_active
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-200 text-gray-600 dark:bg-dark-700 dark:text-gray-300'
                }`}
              >
                {form.is_active ? 'Active' : 'Inactive'}
              </button>
            </div>

            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeForm}
                disabled={saving}
                className="rounded-2xl border border-gray-200 px-5 py-3 text-sm font-black text-gray-600 transition hover:bg-gray-100 disabled:opacity-50 dark:border-dark-700 dark:text-gray-300 dark:hover:bg-dark-700"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={saving}
                className="rounded-2xl bg-primary-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Save Template'}
              </button>
            </div>
          </form>
        )}

        <div className="mb-6 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm dark:border-dark-700 dark:bg-dark-800">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {['all', ...CATEGORIES].map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setFilter(category)}
                  className={`rounded-full px-4 py-2 text-xs font-black capitalize transition ${
                    filter === category
                      ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 dark:bg-dark-900 dark:text-gray-400 dark:hover:bg-dark-700 dark:hover:text-white'
                  }`}
                >
                  {category === 'all' ? 'All' : category}
                </button>
              ))}
            </div>

            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search intent, title, question, answer, or keywords..."
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:placeholder:text-gray-500 lg:w-96"
            />
          </div>
        </div>

        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-black text-gray-950 dark:text-white">
            Templates
          </h2>
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400">
            {filteredTemplates.length} of {templates.length}
          </p>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-56 animate-pulse rounded-3xl bg-white ring-1 ring-gray-200 dark:bg-dark-800 dark:ring-dark-700"
              />
            ))}
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="rounded-3xl border border-gray-200 bg-white p-12 text-center shadow-sm dark:border-dark-700 dark:bg-dark-800">
            <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-3xl bg-primary-50 text-4xl ring-1 ring-primary-100 dark:bg-primary-500/10 dark:ring-primary-500/20">
              🤖
            </div>
            <h2 className="mb-2 text-xl font-black text-gray-950 dark:text-white">
              No templates found
            </h2>
            <p className="mx-auto max-w-md text-sm leading-6 text-gray-600 dark:text-gray-400">
              Add chatbot templates so the AI Assistant can answer common customer questions.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredTemplates.map((template) => (
              <article
                key={template.id}
                className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-dark-700 dark:bg-dark-800"
              >
                <div className="p-5 sm:p-6">
                  <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="inline-flex rounded-full bg-primary-50 px-3 py-1 text-xs font-black capitalize text-primary-700 ring-1 ring-primary-100 dark:bg-primary-500/10 dark:text-primary-400 dark:ring-primary-500/25">
                          {template.category || 'general'}
                        </span>

                        <StatusBadge active={template.is_active} />

                        <span className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-mono font-black text-gray-500 dark:bg-dark-900 dark:text-gray-400">
                          Priority {template.priority ?? 100}
                        </span>
                      </div>

                      <h2 className="text-xl font-black text-gray-950 dark:text-white">
                        {template.title || template.question || template.intent}
                      </h2>

                      <p className="mt-1 text-sm font-black text-primary-600 dark:text-primary-400">
                        {template.intent}
                      </p>

                      <p className="mt-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
                        Updated {formatDateTime(template.updated_at || template.created_at)}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => toggleActive(template)}
                        className={`rounded-2xl px-4 py-2 text-xs font-black ring-1 transition ${
                          template.is_active
                            ? 'bg-gray-100 text-gray-600 ring-gray-200 hover:bg-gray-200 dark:bg-dark-900 dark:text-gray-300 dark:ring-dark-700 dark:hover:bg-dark-700'
                            : 'bg-green-50 text-green-700 ring-green-200 hover:bg-green-100 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25 dark:hover:bg-green-500/20'
                        }`}
                      >
                        {template.is_active ? 'Disable' : 'Enable'}
                      </button>

                      <button
                        type="button"
                        onClick={() => openEditForm(template)}
                        className="rounded-2xl bg-blue-50 px-4 py-2 text-xs font-black text-blue-700 ring-1 ring-blue-200 transition hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/25 dark:hover:bg-blue-500/20"
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        onClick={() => deleteTemplate(template)}
                        disabled={deletingId === template.id}
                        className="rounded-2xl bg-red-50 px-4 py-2 text-xs font-black text-red-700 ring-1 ring-red-200 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25 dark:hover:bg-red-500/20"
                      >
                        {deletingId === template.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </div>

                  {template.question && (
                    <div className="mb-4 rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                      <p className="mb-1 text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Customer Question
                      </p>
                      <p className="text-sm font-semibold leading-6 text-gray-800 dark:text-gray-200">
                        {template.question}
                      </p>
                    </div>
                  )}

                  <div className="mb-4 rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                    <p className="mb-1 text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Chatbot Response
                    </p>
                    <p className="whitespace-pre-wrap text-sm font-semibold leading-6 text-gray-800 dark:text-gray-200">
                      {template.answer || template.response || 'No response set.'}
                    </p>
                  </div>

                  {Array.isArray(template.keywords) && template.keywords.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {template.keywords.map((keyword) => (
                        <span
                          key={keyword}
                          className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-600 dark:bg-dark-900 dark:text-gray-300"
                        >
                          {keyword}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}