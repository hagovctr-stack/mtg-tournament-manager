function initialsForName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase();
  return `${parts[0]!.slice(0, 1)}${parts[parts.length - 1]!.slice(0, 1)}`.toUpperCase();
}

export function PlayerAvatar({
  name,
  avatarUrl,
  size = 'md',
  className = '',
  ringColor,
}: {
  name: string;
  avatarUrl: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Hex color for a soft team-color glow ring, e.g. "#2563eb" */
  ringColor?: string;
}) {
  const sizeClass =
    size === 'sm'
      ? 'h-8 w-8 text-[0.68rem]'
      : size === 'lg'
        ? 'h-14 w-14 text-lg'
        : 'h-10 w-10 text-sm';

  const ringStyle = ringColor
    ? { boxShadow: `0 0 0 2px white, 0 0 0 4px ${ringColor}55` }
    : undefined;

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-stone-200 bg-stone-100 font-semibold text-slate-700 ${sizeClass} ${className}`}
      style={ringStyle}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden="true">{initialsForName(name)}</span>
      )}
    </div>
  );
}
