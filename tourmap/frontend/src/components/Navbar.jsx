import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { MapPin, Compass, CalendarDays, User, LogOut, Bell, CheckCheck, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationsContext';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const NAV = [
  { to: '/',        label: 'Mapa',     Icon: MapPin },
  { to: '/explore', label: 'Explorar', Icon: Compass },
  { to: '/events',  label: 'Eventos',  Icon: CalendarDays },
];

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const { notifications, unreadCount, markRead, markAllRead, clearAll } = useNotifications();
  const navigate  = useNavigate();
  const location  = useLocation();

  const [menuOpen, setMenuOpen]   = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  function handleNotifClick(notif) {
    markRead(notif.id);
    setNotifOpen(false);
    if (notif.data?.placeId) navigate(`/places/${notif.data.placeId}`);
  }

  const NOTIF_ICON = { alert: '⚠️', review: '💬' };

  return (
    <nav className="navbar">
      {/* Logo */}
      <Link to="/" className="navbar__logo">
        <div className="logo__icon" style={{ width: 32, height: 32 }}>
          <MapPin size={16} />
        </div>
        <span className="logo__text" style={{ fontSize: 18 }}>TourMap</span>
      </Link>

      {/* Links centrais (desktop) */}
      <div className="navbar__links">
        {NAV.map(({ to, label, Icon }) => (
          <Link
            key={to}
            to={to}
            className={`navbar__link${location.pathname === to ? ' navbar__link--active' : ''}`}
          >
            <Icon size={15} />
            {label}
          </Link>
        ))}
      </div>

      {/* Ações */}
      <div className="navbar__actions">
        {isAuthenticated ? (
          <>
            {/* Notificações */}
            <div className="navbar__notif-wrap">
              <button
                className="navbar__icon-btn"
                onClick={() => { setNotifOpen((v) => !v); setMenuOpen(false); }}
                aria-label={`Notificações${unreadCount ? ` (${unreadCount} não lidas)` : ''}`}
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span className="navbar__badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
                )}
              </button>

              {notifOpen && (
                <>
                  <div className="navbar__backdrop" onClick={() => setNotifOpen(false)} />
                  <div className="navbar__menu navbar__notif-menu">
                    <div className="navbar__menu-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong>Notificações</strong>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {unreadCount > 0 && (
                          <button
                            className="navbar__icon-btn"
                            onClick={markAllRead}
                            title="Marcar todas como lidas"
                            style={{ width: 26, height: 26, borderRadius: 'var(--radius-xs)' }}
                          >
                            <CheckCheck size={14} />
                          </button>
                        )}
                        {notifications.length > 0 && (
                          <button
                            className="navbar__icon-btn"
                            onClick={clearAll}
                            title="Limpar tudo"
                            style={{ width: 26, height: 26, borderRadius: 'var(--radius-xs)' }}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>

                    {notifications.length === 0 ? (
                      <div style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--gray-400)', fontSize: 13 }}>
                        Nenhuma notificação
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.id}
                          className={`navbar__notif-item${n.read ? '' : ' navbar__notif-item--unread'}`}
                          onClick={() => handleNotifClick(n)}
                        >
                          <span className="navbar__notif-emoji">{NOTIF_ICON[n.type] || '🔔'}</span>
                          <div className="navbar__notif-body">
                            <p>{n.message}</p>
                            <span>
                              {formatDistanceToNow(new Date(n.createdAt), { locale: ptBR, addSuffix: true })}
                            </span>
                          </div>
                          {!n.read && <span className="navbar__notif-dot" />}
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Avatar / menu */}
            <div className="navbar__avatar-wrap">
              <button
                className="navbar__avatar"
                onClick={() => { setMenuOpen((v) => !v); setNotifOpen(false); }}
                aria-label="Menu do usuário"
              >
                {user?.avatar_url
                  ? <img src={user.avatar_url} alt={user.name} />
                  : <span>{user?.name?.[0]?.toUpperCase() || 'U'}</span>}
              </button>

              {menuOpen && (
                <>
                  <div className="navbar__backdrop" onClick={() => setMenuOpen(false)} />
                  <div className="navbar__menu">
                    <div className="navbar__menu-header">
                      <strong>{user?.name}</strong>
                      <small>{user?.email}</small>
                    </div>
                    <Link to="/profile" className="navbar__menu-item" onClick={() => setMenuOpen(false)}>
                      <User size={15} /> Meu perfil
                    </Link>
                    <Link to="/feed" className="navbar__menu-item" onClick={() => setMenuOpen(false)}>
                      📰 Feed
                    </Link>
                    <button className="navbar__menu-item navbar__menu-item--danger" onClick={handleLogout}>
                      <LogOut size={15} /> Sair
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <Link to="/login" className="btn btn--primary btn--sm">Entrar</Link>
        )}
      </div>
    </nav>
  );
}
