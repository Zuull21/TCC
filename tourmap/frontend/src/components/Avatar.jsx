const COLORS = ['#5B4FE8','#EC4899','#10B981','#F59E0B','#06B6D4','#8B5CF6','#EF4444','#0284C7'];

function colorFromName(name = '') {
  const hash = [...name].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 0);
  return COLORS[Math.abs(hash) % COLORS.length];
}

export default function Avatar({ user, size = 36, style = {} }) {
  const color    = colorFromName(user?.name);
  const initials = (user?.name || '?')
    .split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();

  const base = {
    width: size, height: size,
    borderRadius: '50%',
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...style,
  };

  if (user?.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt={user.name || 'avatar'}
        style={{ ...base, objectFit: 'cover' }}
      />
    );
  }

  return (
    <div style={{ ...base, background: color, color: '#fff', fontWeight: 700, fontSize: Math.round(size * 0.38) }}>
      {initials}
    </div>
  );
}
