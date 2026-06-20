import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';

export default function RatingModal({ booking, onClose, onSubmitted }) {
  const { user } = useAuth();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (rating === 0) {
      setError('Please select a star rating.');
      return;
    }
    setError('');
    setSubmitting(true);

    try {
      const { error: insertError } = await supabase
        .from('mechanic_ratings')
        .insert({
          booking_id: booking.id,
          mechanic_id: booking.mechanic_id,
          customer_id: user.id,
          rating,
          comment: comment.trim() || null,
        });

      if (insertError) throw insertError;

      onSubmitted();
    } catch (err) {
      setError(err.message || 'Failed to submit rating.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6"
        style={{
          background: 'rgba(15, 15, 15, 0.95)',
          border: '1px solid rgba(236, 72, 153, 0.2)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
          color: 'white',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold" style={{ color: 'white' }}>
            Rate Your Service
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xl leading-none"
          >
            ✕
          </button>
        </div>

        <p className="text-sm mb-1" style={{ color: '#9ca3af' }}>
          {booking.services?.name || 'Service'}
        </p>
        <p className="text-xs mb-5" style={{ color: '#6b7280' }}>
          {booking.booking_date} at {booking.booking_time}
        </p>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg p-3 mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Star picker */}
          <div className="flex justify-center gap-2 mb-5">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                className="text-4xl transition-transform hover:scale-110"
              >
                <span
                  className={
                    star <= (hoverRating || rating) ? 'text-yellow-400' : 'text-gray-600'
                  }
                >
                  ★
                </span>
              </button>
            ))}
          </div>

          <div className="mb-5">
            <label className="block text-sm mb-1.5" style={{ color: '#d1d5db' }}>
              Comment <span style={{ color: '#6b7280' }}>(optional)</span>
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder="How was your experience with this mechanic?"
              className="w-full px-3 py-2.5 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500 resize-none"
            />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-700 hover:border-gray-500 py-2.5 rounded-lg text-sm transition"
              style={{ color: '#d1d5db' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition text-sm"
            >
              {submitting ? 'Submitting...' : 'Submit Rating'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}