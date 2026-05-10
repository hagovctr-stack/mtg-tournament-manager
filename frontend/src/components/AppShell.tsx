import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';

type ShellLink = {
  to: string;
  label: string;
  match: (pathname: string) => boolean;
};

const SHELL_LINKS: ShellLink[] = [
  { to: '/', label: 'Dashboard', match: (pathname) => pathname === '/' },
  {
    to: '/tournaments',
    label: 'Tournaments',
    match: (pathname) => pathname === '/tournaments' || pathname.startsWith('/tournament/'),
  },
  {
    to: '/leagues',
    label: 'Leagues',
    match: (pathname) => pathname === '/leagues' || pathname.startsWith('/leagues/'),
  },
  {
    to: '/events',
    label: 'Events',
    match: (pathname) => pathname === '/events' || pathname.startsWith('/events/'),
  },
  {
    to: '/players',
    label: 'Players',
    match: (pathname) => pathname === '/players' || pathname.startsWith('/players/'),
  },
];

function currentWorkspace(pathname: string) {
  return SHELL_LINKS.find((item) => item.match(pathname))?.label ?? 'MTG Tournament Manager';
}

function HomeIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    >
      <path d="m3 10.5 9-7 9 7" />
      <path d="M5 9.5V20h14V9.5" />
      <path d="M9 20v-6h6v6" />
    </svg>
  );
}

function MenuIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="2"
    >
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

function ShellNav({
  pathname,
  canManage,
  onNavigate,
}: {
  pathname: string;
  canManage: boolean;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col bg-[#0d1220]">
      <div className="border-b border-white/8 px-5 py-6">
        <Link to="/" onClick={onNavigate} className="flex items-center gap-3">
          <img
            src="/mtg-planeswalker.svg"
            alt="Magic: The Gathering planeswalker symbol"
            className="h-9 w-9 shrink-0"
          />
          <div>
            <p className="font-serif text-[1.42rem] font-semibold tracking-tight text-white">MTG</p>
            <p className="text-sm text-slate-400">Tournament Manager</p>
          </div>
        </Link>
      </div>

      <div className="px-4 py-5">
        <nav className="space-y-1.5">
          {SHELL_LINKS.map((item) => {
            const active = item.match(pathname);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onNavigate}
                className={`group flex items-center rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? 'border-white/20 bg-white text-slate-950 shadow-lg shadow-black/20'
                    : 'border-transparent text-slate-300 hover:border-white/10 hover:bg-white/5 hover:text-white'
                }`}
              >
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>

      {canManage && (
        <div className="px-4">
          <Link
            to="/?compose=tournament"
            onClick={onNavigate}
            className="flex items-center justify-between rounded-xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(15,23,42,0.22)] transition hover:bg-rose-500"
          >
            <span>Create</span>
            <span className="text-lg leading-none">+</span>
          </Link>
        </div>
      )}
    </div>
  );
}

function MobileDrawer({
  pathname,
  open,
  onClose,
  children,
}: {
  pathname: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 xl:hidden">
      <button
        type="button"
        aria-label="Close navigation drawer"
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="absolute inset-y-0 left-0 w-[86vw] max-w-[320px] overflow-y-auto bg-[#0d1220] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          {pathname === '/' ? (
            <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300">
              <HomeIcon className="h-[18px] w-[18px]" />
              <span className="sr-only">Dashboard</span>
            </div>
          ) : (
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-300">
              {currentWorkspace(pathname)}
            </p>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 px-3 py-1 text-sm text-slate-300"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function AppShell() {
  const location = useLocation();
  const { canManage } = useAuth();
  const pathname = location.pathname;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const workspace = useMemo(() => currentWorkspace(pathname), [pathname]);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen bg-stone-100 text-slate-900">
      <MobileDrawer pathname={pathname} open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <ShellNav
          pathname={pathname}
          canManage={canManage}
          onNavigate={() => setDrawerOpen(false)}
        />
      </MobileDrawer>

      <div className="flex min-h-screen w-full">
        <aside className="hidden w-[260px] shrink-0 border-r border-slate-900/90 xl:block 2xl:w-[272px]">
          <div className="sticky top-0 h-screen overflow-y-auto">
            <ShellNav pathname={pathname} canManage={canManage} />
          </div>
        </aside>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-stone-200/80 bg-stone-100/95 backdrop-blur xl:hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <button
                type="button"
                aria-label="Open navigation menu"
                onClick={() => setDrawerOpen(true)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-stone-200 bg-white text-slate-800 shadow-sm transition hover:border-stone-300 hover:bg-stone-50"
              >
                <MenuIcon className="h-5 w-5" />
              </button>
              {pathname === '/' ? (
                <div
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-stone-200 bg-white text-slate-800 shadow-sm"
                  title="Dashboard"
                >
                  <HomeIcon className="h-5 w-5" />
                  <span className="sr-only">Dashboard</span>
                </div>
              ) : (
                <div className="text-right">
                  <p className="font-serif text-lg font-semibold text-slate-950">{workspace}</p>
                </div>
              )}
            </div>
          </header>

          <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
            <div className="w-full max-w-[1500px]">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
