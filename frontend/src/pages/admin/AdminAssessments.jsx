import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

const STATUS_COLORS = {
  pending: 'bg-yellow-500/20 text-yellow-400',
  reviewed: 'bg-blue-500/20 text-blue-400',
  converted: 'bg-green-500/20 text-green-400',
};

export default function AdminAssessments() {
  const [assessments, setAssessments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [updating, setUpdating] = useState(null);

  useEffect(() => {
    fetchAssessments();
  }, []);

  async function fetchAssessments() {
    const { data } = await supabase
      .from('pre_assessments')
      .select('*, services(name), profiles(first_name, last_name, email)')
      .order('created_at', { ascending: false });
    if (data) setAssessments(data);
    setLoading(false);
  }

  async function updateStatus(id, status) {
    setUpdating(id);
    await supabase.from('pre_assessments').update({ status }).eq('id', id);
    setAssessments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status } : a))
    );
    setUpdating(null);
  }

  const filtered =
    filter === 'all' ? assessments : assessments.filter((a) => a.status === filter);

  const counts = {
    all: assessments.length,
    pending: assessments.filter((a) => a.status === 'pending').length,
    reviewed: assessments.filter((a) => a.status === 'reviewed').length,
    converted: assessments.filter((a) => a.status === 'converted').length,
  };

  return (
    <div className="min-h-[calc(100vh-65px)] bg-dark-900 text-white px-6 py-10">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-1">Pre-Assessments</h1>
          <p className="text-gray-400">Review and manage customer cost estimate requests.</p>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {['all', 'pending', 'reviewed', 'converted'].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium capitalize transition ${
                filter === s
                  ? 'bg-primary-600 text-white'
                  : 'bg-dark-800 text-gray-400 hover:text-white'
              }`}
            >
              {s} <span className="opacity-60">({counts[s]})</span>
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-gray-400">Loading...</p>
        ) : filtered.length === 0 ? (
          <div className="bg-dark-800 rounded-xl p-10 text-center">
            <p className="text-4xl mb-3">📋</p>
            <p className="text-gray-400">No assessments found.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((a) => (
              <div key={a.id} className="bg-dark-800 rounded-xl p-5">

                {/* Top row */}
                <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
                  <div>
                    <p className="font-semibold text-lg">
                      {a.motorcycle_make} {a.motorcycle_model}
                      {a.motorcycle_year ? ` (${a.motorcycle_year})` : ''}
                    </p>
                    <p className="text-sm text-gray-400 mt-0.5">
                      👤 {a.profiles?.first_name} {a.profiles?.last_name}
                      {a.profiles?.email ? ` · ${a.profiles.email}` : ''}
                    </p>
                    <p className="text-sm text-primary-400 mt-0.5">
                      🔧 {a.services?.name || 'No service selected'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(a.created_at).toLocaleString()}
                    </p>
                  </div>
                  <span className={`text-xs px-3 py-1 rounded-full capitalize font-medium ${STATUS_COLORS[a.status]}`}>
                    {a.status}
                  </span>
                </div>

                {/* Issue description */}
                {a.issue_description && (
                  <div className="bg-dark-900 rounded-lg px-4 py-3 mb-4 text-sm text-gray-300 italic">
                    "{a.issue_description}"
                  </div>
                )}

                {/* Cost breakdown */}
                <div className="bg-dark-900 rounded-lg p-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-4">
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Base Price</p>
                    <p className="font-medium">₱{Number(a.estimated_parts_cost || 0).toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Labor Cost</p>
                    <p className="font-medium">₱{Number(a.estimated_labor_cost || 0).toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Total Estimate</p>
                    <p className="font-medium text-white">₱{Number(a.estimated_total || 0).toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Down Payment</p>
                    <p className="font-medium text-accent-400">₱{Number(a.down_payment_required || 0).toFixed(2)}</p>
                  </div>
                </div>

                {/* Status actions */}
                <div className="flex gap-2 flex-wrap">
                  {a.status !== 'reviewed' && (
                    <button
                      onClick={() => updateStatus(a.id, 'reviewed')}
                      disabled={updating === a.id}
                      className="text-xs px-3 py-1.5 rounded-md bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition disabled:opacity-50"
                    >
                      Mark as Reviewed
                    </button>
                  )}
                  {a.status !== 'converted' && (
                    <button
                      onClick={() => updateStatus(a.id, 'converted')}
                      disabled={updating === a.id}
                      className="text-xs px-3 py-1.5 rounded-md bg-green-500/20 text-green-400 hover:bg-green-500/30 transition disabled:opacity-50"
                    >
                      Mark as Converted
                    </button>
                  )}
                  {a.status !== 'pending' && (
                    <button
                      onClick={() => updateStatus(a.id, 'pending')}
                      disabled={updating === a.id}
                      className="text-xs px-3 py-1.5 rounded-md bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 transition disabled:opacity-50"
                    >
                      Reset to Pending
                    </button>
                  )}
                </div>

              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}