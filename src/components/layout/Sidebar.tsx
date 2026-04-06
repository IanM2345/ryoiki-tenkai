'use client';
import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import s from './sidebar.module.css';

interface NavItem { icon: string; label: string; href: string; count?: number; }

const SPACES: NavItem[] = [
  { icon: '⌂', label: 'Dashboard', href: '/dashboard' },
  { icon: '◫', label: 'Library',   href: '/library'   },
  { icon: '✐', label: 'Journal',   href: '/journal'   },
  { icon: '✓', label: 'Tasks',     href: '/tasks'     },
  { icon: '💡',label: 'Ideas',     href: '/ideas'     },
  { icon: '▷', label: 'Queue',     href: '/queue'     },
  { icon: '◎', label: 'Places',    href: '/places'    },
];
const TOOLS: NavItem[] = [
  { icon: '⌕', label: 'Search',      href: '/search'  },
  { icon: '★', label: 'Ratings',     href: '/ratings' },
  { icon: '☁', label: 'Mood Bubble', href: '/mood'    },
  { icon: '🎮',label: 'Arcade',      href: '/games'   },
];
const YOU: NavItem[] = [
  { icon: '◑', label: 'Theme',    href: '/theme'          },
  { icon: '👁', label: 'Souls',    href: '/souls'          },
  { icon: '🖼', label: 'Gallery',  href: '/gallery'        },
  { icon: '📊', label: 'Stats',    href: '/stats'          },
  { icon: '🔑', label: 'Password', href: '/reset-password' },
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
  const router         = useRouter();
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
    // Hide mobile burger when sidebar is open, show when closed
    if (mobileBurgerRef.current) {
      mobileBurgerRef.current.style.display = mobile && !open ? 'flex' : 'none';
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
    if (typeof window !== 'undefined') {
      localStorage.removeItem('yw-session');
    }
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
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

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/');

  const NavLink = ({ icon, label, href, count }: NavItem) => (
    <Link
      href={href}
      className={`${s.navItem} ${isActive(href) ? s.navItemActive : ''}`}
      onClick={() => { if (isMobile()) close(); }}
    >
      <span className={s.navIcon}>{icon}</span>
      <span className={s.navLabel}>{label}</span>
      {!!count && count > 0 && <span className={s.navCount}>{count}</span>}
    </Link>
  );

  return (
    <>
      <div
        ref={backdropRef}
        className={s.backdrop}
        style={{ display: 'none' }}
        onClick={close}
      />

      {/* Mobile burger — hidden via syncDOM when sidebar opens */}
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

      <aside ref={sidebarRef} className={`${s.sidebar} ${s.sidebarClosed}`}>
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
            ✦ <span className={s.logoOr}>Malevolent</span><span className={s.logoPu}>Shrine</span>
          </div>
          <div className={s.logoSub}>private &amp; just for you</div>
        </div>

        <div className={s.sectionLabel}>Spaces</div>
        {SPACES.map(i => <NavLink key={i.href} {...i} />)}

        <div className={s.sectionLabel}>Tools</div>
        {TOOLS.map(i => <NavLink key={i.href} {...i} />)}

        <div className={s.sectionLabel}>You</div>
        {YOU.map(i => <NavLink key={i.href} {...i} />)}

        <button className={s.logoutBtn} onClick={handleLogout}>
          <span className={s.navIcon}>⎋</span>
          <span className={s.navLabel}>Log out</span>
        </button>

        <div className={s.sidebarFooter}>yourworld · v1.0</div>
      </aside>
    </>
  );
}