import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Plus, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { posts as postsApi } from '../services/api';
import Navbar    from '../components/Navbar';
import BottomNav from '../components/BottomNav';
import Avatar    from '../components/Avatar';
import Spinner   from '../components/Spinner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function Feed() {
  const { isAuthenticated } = useAuth();
  const { addToast } = useToast();
  const [posts, setPosts]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [page, setPage]           = useState(1);
  const [hasMore, setHasMore]     = useState(false);
  const [showForm, setShowForm]   = useState(false);
  const LIMIT = 10;

  useEffect(() => { loadPosts(1, true); }, []);

  async function loadPosts(p = 1, reset = false) {
    setLoading(true);
    try {
      const { data } = await postsApi.list({ page: p, limit: LIMIT });
      setPosts((prev) => reset ? data.items : [...prev, ...data.items]);
      setHasMore(data.items.length === LIMIT);
    } catch {
      addToast('Não foi possível carregar o feed. Tente novamente.', 'error');
    } finally { setLoading(false); }
  }

  async function handleLike(postId) {
    if (!isAuthenticated) { addToast('Faça login para curtir.', 'warning'); return; }
    try {
      const { data } = await postsApi.like(postId);
      setPosts((p) => p.map((post) => post.id === postId ? { ...post, likes_count: data.likes_count } : post));
    } catch { addToast('Erro ao curtir.', 'error'); }
  }

  function onPostCreated(post) {
    setPosts((p) => [post, ...p]);
    setShowForm(false);
    addToast('Post publicado!', 'success');
  }

  return (
    <div className="screen">
      <Navbar />

      <div className="feed-layout">
        <div className="feed-header">
          <h1 className="feed-title">Feed da Comunidade</h1>
          {isAuthenticated && (
            <button className="btn btn--primary btn--sm" onClick={() => setShowForm((v) => !v)}>
              {showForm ? <><X size={14} /> Fechar</> : <><Plus size={14} /> Novo post</>}
            </button>
          )}
        </div>

        {showForm && <NewPostForm onCreated={onPostCreated} />}

        {loading && posts.length === 0 ? (
          <Spinner center dark />
        ) : posts.length === 0 ? (
          <div className="explore-empty">
            <div style={{ fontSize: 52 }}>📝</div>
            <p>Nenhum post ainda. Seja o primeiro!</p>
          </div>
        ) : (
          <div className="feed-list">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} onLike={handleLike} />
            ))}
            {hasMore && (
              <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <button className="btn btn--ghost btn--sm" onClick={() => { const next = page+1; setPage(next); loadPosts(next); }} disabled={loading}>
                  {loading ? <Spinner dark /> : 'Carregar mais'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}

function PostCard({ post, onLike }) {
  return (
    <div className="post-card">
      <div className="post-card__header">
        <Avatar user={post.author} size={36} />
        <div className="post-card__author">
          <strong>{post.author?.name || 'Usuário'}</strong>
          {post.place && (
            <Link to={`/places/${post.place.id}`} className="post-card__place">
              📍 {post.place.name}
            </Link>
          )}
          <span className="post-card__date">
            {(() => { const d = new Date(post.createdAt ?? post.created_at); return isNaN(d) ? '' : formatDistanceToNow(d, { locale: ptBR, addSuffix: true }); })()}
          </span>
        </div>
      </div>
      <h4 className="post-card__title">{post.title}</h4>
      <p className="post-card__body">{post.content}</p>
      {post.image_url && (
        <img src={post.image_url} alt={post.title} className="post-card__img" loading="lazy" />
      )}
      <div className="post-card__footer">
        <button className="post-like-btn" onClick={() => onLike(post.id)}>
          <Heart size={15} /> {post.likes_count || 0}
        </button>
      </div>
    </div>
  );
}

function NewPostForm({ onCreated }) {
  const { addToast } = useToast();
  const [title, setTitle]     = useState('');
  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim())   { addToast('Informe o título.', 'warning'); return; }
    if (!content.trim()) { addToast('Informe o conteúdo.', 'warning'); return; }
    if (content.trim().length < 10) { addToast('Conteúdo muito curto (mínimo 10 caracteres).', 'warning'); return; }
    setLoading(true);
    try {
      const { data } = await postsApi.create({
        title: title.trim(),
        content: content.trim(),
        image_url: imageUrl.trim() || null,
      });
      onCreated(data.post);
    } catch (err) {
      addToast(err.response?.data?.error || 'Erro ao publicar.', 'error');
    } finally { setLoading(false); }
  }

  return (
    <form className="new-post-form" onSubmit={handleSubmit}>
      <div className="field">
        <input className="field__input" placeholder="Título do post" value={title}
          onChange={(e) => setTitle(e.target.value)} autoFocus />
      </div>
      <div className="field">
        <textarea className="field__input" rows={3} placeholder="O que você quer compartilhar?"
          value={content} onChange={(e) => setContent(e.target.value)} style={{ resize:'vertical' }} />
      </div>
      <div className="field">
        <input className="field__input" type="url" placeholder="URL da imagem (opcional)"
          value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
      </div>
      <button type="submit" className="btn btn--primary btn--sm" disabled={loading}>
        {loading ? <Spinner /> : 'Publicar'}
      </button>
    </form>
  );
}
