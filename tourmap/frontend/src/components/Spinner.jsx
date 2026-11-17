export default function Spinner({ size = 'sm', dark = false, center = false }) {
  const cls = ['spinner', dark ? 'spinner--dark' : '', size === 'lg' ? 'spinner--lg' : '']
    .filter(Boolean)
    .join(' ');

  if (center) {
    return (
      <div className="spinner-center">
        <div className={`spinner spinner--dark ${size === 'lg' ? 'spinner--lg' : ''}`} />
      </div>
    );
  }

  return <div className={cls} />;
}
