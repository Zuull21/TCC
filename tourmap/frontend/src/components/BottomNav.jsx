import { Link, useLocation } from 'react-router-dom';
import { MapPin, Compass, Newspaper, CalendarDays, User } from 'lucide-react';
const ITEMS = [
  { to: '/',        label: 'Mapa',     Icon: MapPin },
  { to: '/explore', label: 'Explorar', Icon: Compass },
  { to: '/feed',    label: 'Feed',     Icon: Newspaper },
  { to: '/events',  label: 'Eventos',  Icon: CalendarDays },
  { to: '/profile', label: 'Perfil',   Icon: User },
];

export default function BottomNav() {
  const location = useLocation();

  return (
    <nav className="bottom-nav">
      {ITEMS.map(({ to, label, Icon }) => {
        const active = location.pathname === to;
        return (
          <Link
            key={to}
            to={to}
            className={`bottom-nav__item${active ? ' bottom-nav__item--active' : ''}`}
          >
            <Icon size={20} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
