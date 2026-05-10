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
}: {
  name: string;
  avatarUrl: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizeClass =
    size === 'sm'
      ? 'h-8 w-8 text-[0.68rem]'
      : size === 'lg'
        ? 'h-14 w-14 text-lg'
        : 'h-10 w-10 text-sm';

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-stone-200 bg-stone-100 font-semibold text-slate-700 ${sizeClass} ${className}`}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden="true">{initialsForName(name)}</span>
      )}
    </div>
  );
}
