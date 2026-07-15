const TONE_CLASSES = {
  neutral: 'badge-neutral',
  success: 'badge-success',
  danger: 'badge-danger',
  warning: 'badge-warning',
  brand: 'badge-brand',
};

export default function Badge({ tone = 'neutral', children }) {
  const toneClass = TONE_CLASSES[tone] || TONE_CLASSES.neutral;
  return <span className={`badge ${toneClass}`}>{children}</span>;
}
