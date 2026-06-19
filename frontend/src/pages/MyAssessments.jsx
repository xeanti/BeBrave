import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';

export default function MyAssessments() {
  const { user } = useAuth();
  const [assessments, setAssessments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAssessments();
  }, [user]);

  async function fetchAssessments() {
    const { data } = await supabase
      .from('pre_assessments')
      .select('*, services(name)')
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false });
    if (data) setAssessments(data);
    setLoading(false);
  }

  return (
    <div className="min-h-[calc(100vh-65px)] bg-dark-900 text-white px-6 py-10">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-1">My Assessments</h1>
            <p className="text-gray-400">Your pre-assessment cost estimates.</p>
          </div>
          <Link
            to="/pre-assessment"
            className="bg-primary-600 hover:bg-primary-700 px-4 py-2 rounded-lg text-sm font-medium transition"
          >
            + New Assessment
          </Link>
        </div>

        {loading ? (
          <p className="text-gray-400">Loading...</p>
        ) : assessments.length === 0 ? (
          <div className="bg-dark-800 rounded-xl p-10 text-center">
            <p className="text-4xl mb-3">📋</p>
            <p className="text-gray-400 mb-4">No assessments yet.</p>
            <Link
              to="/pre-assessment"
              className="text-primary-400 hover:underline text-sm"
            >
              Get your first cost estimate →
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {assessments.map((a) => (
              <div key={a.id} className="bg-dark-800 rounded-xl p-5">
                <div className="flex items-start justify-between flex-wrap gap-3 mb-3">
                  <div>
                    <p className="font-semibold">
                      {a.motorcycle_make} {a.motorcycle_model}
                      {a.motorcycle_year ? ` (${a.motorcycle_year})` : ''}
                    </p>
                    <p className="text-sm text-gray-400 mt-0.5">
                      {a.services?.name || 'Service not found'}
                    </p>
                    {a.issue_description && (
                      <p className="text-sm text-gray-500 mt-1 italic">
                        "{a.issue_description}"
                      </p>
                    )}
                    <p className="text-xs text-gray-600 mt-1">
                      {new Date(a.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={`text-xs px-3 py-1 rounded-full capitalize ${
                    a.status === 'converted'
                      ? 'bg-green-500/20 text-green-400'
                      : a.status === 'reviewed'
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'bg-yellow-500/20 text-yellow-400'
                  }`}>
                    {a.status}
                  </span>
                </div>

                <div className="bg-dark-900 rounded-lg p-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Base Price</p>
                    <p className="font-medium">₱{a.estimated_parts_cost || 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Labor Cost</p>
                    <p className="font-medium">₱{a.estimated_labor_cost || 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Total Estimate</p>
                    <p className="font-medium text-white">₱{a.estimated_total || 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Down Payment</p>
                    <p className="font-medium text-accent-400">₱{a.down_payment_required || 0}</p>
                  </div>
                </div>

                {a.status !== 'converted' && (
                  <div className="mt-3">
                    <Link
                      to="/booking"
                      state={{ service_id: a.service_id }}
                      className="text-xs text-primary-400 border border-primary-500/30 px-3 py-1.5 rounded-md hover:bg-primary-500/10 transition"
                    >
                      Book this service →
                    </Link>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}