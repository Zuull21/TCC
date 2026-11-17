import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import { reviews as reviewsApi } from '../services/api';
import StarRating from './StarRating';
import Spinner from './Spinner';

export default function ReviewForm({ placeId, onSuccess, alreadyReviewed = false }) {
  const { isAuthenticated } = useAuth();
  const { addToast } = useToast();
  const [rating, setRating]     = useState(0);
  const [comment, setComment]   = useState('');
  const [loading, setLoading]   = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (!isAuthenticated) {
    return (
      <div className="review-form-gate">
        <p>Faça <Link to="/login" className="link">login</Link> para deixar sua avaliação.</p>
      </div>
    );
  }

  if (alreadyReviewed || submitted) {
    return (
      <div className="review-form-gate">
        <p>✅ Você já avaliou este lugar.</p>
      </div>
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!rating) { addToast('Selecione uma nota.', 'warning'); return; }
    if (comment.trim().length < 10) { addToast('Comentário deve ter ao menos 10 caracteres.', 'warning'); return; }

    setLoading(true);
    try {
      const { data } = await reviewsApi.create(placeId, { rating, comment: comment.trim() });
      addToast('Avaliação enviada! 🎉', 'success');
      onSuccess?.(data.review);
      setSubmitted(true);
    } catch (err) {
      const msg = err.response?.data?.error || 'Erro ao enviar avaliação.';
      addToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="review-form" onSubmit={handleSubmit}>
      <div className="review-form__stars">
        <span className="field__label">Sua nota</span>
        <StarRating value={rating} onChange={setRating} size={28} />
      </div>
      <div className="field">
        <label className="field__label">Comentário</label>
        <textarea
          className="field__input"
          rows={3}
          placeholder="Conte sua experiência neste lugar… (mínimo 10 caracteres)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={1000}
          style={{ resize: 'vertical' }}
        />
        <span className="field__hint">{comment.length}/1000</span>
      </div>
      <button
        type="submit"
        className="btn btn--primary"
        disabled={loading || !rating}
        style={{ alignSelf: 'flex-start', minWidth: 140 }}
      >
        {loading ? <Spinner /> : 'Enviar avaliação'}
      </button>
    </form>
  );
}
