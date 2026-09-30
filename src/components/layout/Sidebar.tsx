'use client';
import { supabase } from '@/lib/supabase';
import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  House, LibraryBig, NotebookPen, ListChecks, Lightbulb, ListVideo, MapPin,
  Search, Star, Cloudy, Gamepad2, Palette, Users, Images, Hourglass, HardDriveDownload, ChartColumn, KeyRound,
  LogOut, Sparkles, type LucideIcon,
} from 'lucide-react';
import s from './sidebar.module.css';
import { openWhatsNew } from '@/lib/whatsNew';

interface NavItem { icon: LucideIcon; label: string; href: string; count?: number; }

const SPACES: NavItem[] = [
  { icon: House,       label: 'Dashboard', href: '/dashboard' },
  { icon: LibraryBig,  label: 'Library',   href: '/library'   },
  { icon: NotebookPen, label: 'Journal',   href: '/journal'   },
  { icon: ListChecks,  label: 'Tasks',     href: '/tasks'     },
  { icon: Lightbulb,   label: 'Ideas',     href: '/ideas'     },
  { icon: ListVideo,   label: 'Queue',     href: '/queue'     },
  { icon: MapPin,      label: 'Places',    href: '/places'    },
];
const TOOLS: NavItem[] = [
  { icon: Search,   label: 'Search',      href: '/search'  },
  { icon: Star,     label: 'Ratings',     href: '/ratings' },
  { icon: Cloudy,   label: 'Mood Bubble', href: '/mood'    },
  { icon: Gamepad2, label: 'Arcade',      href: '/games'   },
];
const YOU: NavItem[] = [
  { icon: Palette,     label: 'Theme',    href: '/theme'          },
  { icon: Users,       label: 'Souls',    href: '/souls'          },
  { icon: Images,      label: 'Gallery',  href: '/gallery'        },
  { icon: Hourglass,   label: 'Time capsule', href: '/capsules'   },
  { icon: ChartColumn, label: 'Stats',    href: '/stats'          },
  { icon: HardDriveDownload, label: 'App & backup', href: '/settings' },
  { icon: KeyRound,    label: 'Password', href: '/reset-password' },
];

function isDesktop() {
  return typeof window !== 'undefined' && window.innerWidth >= 1024;
}

function applyOpen(open: boolean) {
  document.body.classList.toggle('sidebar-open',   open);
  document.body.classList.toggle('sidebar-closed', !open);
}

export default function Sidebar() {
  const pathname       = usePathname();
  const sidebarRef     = useRef<HTMLElement>(null);
  const btnRef         = useRef<HTMLButtonElement>(null);
  const mobileBurgerRef = useRef<HTMLButtonElement>(null);
  const backdropRef    = useRef<HTMLDivElement>(null);
  const openRef        = useRef(false);

  function syncDOM() {
    const open = openRef.current;
    const mobile = window.innerWidth < 1024;

    if (sidebarRef.current) {
      sidebarRef.current.className = [
        s.sidebar,
        open ? s.sidebarOpen : s.sidebarClosed,
      ].join(' ');
    }
    if (btnRef.current) {
      btnRef.current.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      const bars = btnRef.current.querySelectorAll('span');
      bars[0].className = `${s.bar} ${open ? s.barTopOpen : ''}`;
      bars[1].className = `${s.bar} ${open ? s.barMidOpen : ''}`;
      bars[2].className = `${s.bar} ${open ? s.barBotOpen : ''}`;
    }
    // Phones: floating menu button shows only while the drawer is closed
    if (mobileBurgerRef.current) {
      const phone = window.innerWidth < 768;
      mobileBurgerRef.current.style.display = phone && !open ? 'flex' : 'none';
    }
    if (backdropRef.current) {
      backdropRef.current.style.display = open && mobile ? 'block' : 'none';
    }
    applyOpen(open);
  }

  function toggle() {
    openRef.current = !openRef.current;
    syncDOM();
  }

  function close() {
    if (openRef.current) {
      openRef.current = false;
      syncDOM();
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut().catch(() => {});
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    window.location.replace('/login');
  }

  useEffect(() => {
    const initial = isDesktop();
    openRef.current = initial;
    applyOpen(initial);
    syncDOM();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openRef.current) toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isMobile = () => window.innerWidth < 1024;

  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/reset-password');

  // Auth pages have no sidebar, so the main area shouldn't reserve space for it.
  useEffect(() => {
    document.body.classList.toggle('no-sidebar', isAuthPage);
  }, [isAuthPage]);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/');

  const NavLink = ({ icon: Icon, label, href, count }: NavItem) => (
    <Link
      href={href}
      title={label}
      aria-current={isActive(href) ? 'page' : undefined}
      className={`${s.navItem} ${isActive(href) ? s.navItemActive : ''}`}
      onClick={() => { if (isMobile()) close(); }}
    >
      <span className={s.navIcon}><Icon size={18} strokeWidth={1.75} aria-hidden /></span>
      <span className={s.navLabel}>{label}</span>
      {!!count && count > 0 && <span className={s.navCount}>{count}</span>}
    </Link>
  );

  if (isAuthPage) return null;

  return (
    <>
      <div
        ref={backdropRef}
        className={s.backdrop}
        style={{ display: 'none' }}
        onClick={close}
      />

      {/* Mobile burger, hidden by syncDOM while the sidebar is open */}
      <button
        ref={mobileBurgerRef}
        className={s.mobileBurger}
        onClick={toggle}
        aria-label="Open menu"
        style={{ display: 'none' }} // syncDOM sets correct value after mount
      >
        <span className={s.bar} />
        <span className={s.bar} />
        <span className={s.bar} />
      </button>

      <aside ref={sidebarRef} aria-label="Main navigation" className={`${s.sidebar} ${s.sidebarClosed}`}>
        <button
          ref={btnRef}
          className={s.toggleBtn}
          onClick={toggle}
          aria-label="Open menu"
        >
          <span className={s.bar} />
          <span className={s.bar} />
          <span className={s.bar} />
        </button>

        <div className={s.logo}>
          <div className={s.logoText}>
            <Sparkles size={16} strokeWidth={2} className={s.logoMark} aria-hidden />
            <span className={s.logoOr}>Malevolent</span><span className={s.logoPu}>Shrine</span>
          </div>
          <div className={s.logoSub}>private &amp; just for you</div>
        </div>

        <div className={s.sectionLabel}>Spaces</div>
        {SPACES.map(i => <NavLink key={i.href} {...i} />)}

        <div className={s.sectionLabel}>Tools</div>
        {TOOLS.map(i => <NavLink key={i.href} {...i} />)}

        <div className={s.sectionLabel}>You</div>
        {YOU.map(i => <NavLink key={i.href} {...i} />)}
        <button type="button" className={s.newsBtn} title="What's new" onClick={() => { if (window.innerWidth < 768) close(); openWhatsNew(); }}>
          <span className={s.navIcon}><Sparkles size={18} strokeWidth={1.75} aria-hidden /></span>
          <span className={s.navLabel}>What&apos;s new</span>
        </button>

        <button className={s.logoutBtn} onClick={handleLogout}>
          <span className={s.navIcon}><LogOut size={18} strokeWidth={1.75} aria-hidden /></span>
          <span className={s.navLabel}>Log out</span>
        </button>

        <div className={s.sidebarFooter}>yourworld</div>
      </aside>
    </>
  );
}