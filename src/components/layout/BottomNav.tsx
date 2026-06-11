'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Leaf, Layers, BookOpen, User, ShoppingCart, Package, Users, ClipboardList } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export function BottomNav() {
  const pathname = usePathname();
  const [role, setRole] = useState('');
  const { t } = useLanguage();

  useEffect(() => {
    const u = JSON.parse(localStorage.getItem('snms_user') || '{}');
    setRole(u.role || '');
  }, []);

  if (pathname === '/login') return null;

  const isOwner = role === 'owner';
  
  const OWNER_LINKS = [
    { href: '/dashboard', label: t('dashboard'),     icon: Home },
    { href: '/sales/new',      label: t('directSales'),     icon: ShoppingCart },
    { href: '/bookings',  label: t('bookings'), icon: BookOpen },
    { href: '/customers', label: 'Customers', icon: ClipboardList },
    { href: '/lots',      label: t('lots'),     icon: Layers },
    { href: '/attendance', label: 'Attendance', icon: Users },
    { href: '/profile',   label: 'Profile',  icon: User },
  ];

  const WORKER_LINKS = [
    { href: '/dashboard', label: t('dashboard'),    icon: Home },
    { href: '/sales/new',      label: t('directSales'),    icon: ShoppingCart },
    { href: '/bookings',  label: t('bookings'), icon: BookOpen },
    { href: '/notebook',  label: 'Ledger', icon: BookOpen },
    { href: '/lots',      label: t('lots'),   icon: Package },
    { href: '/profile',   label: 'Profile', icon: User },
  ];

  const links = isOwner ? OWNER_LINKS : WORKER_LINKS;
  const activeColor  = isOwner ? 'text-green-600' : 'text-blue-600';
  const hoverColor   = isOwner ? 'hover:text-green-500' : 'hover:text-blue-500';

  return (
    <nav className="fixed bottom-0 w-full bg-white border-t border-gray-200 pb-[env(safe-area-inset-bottom)] z-40">
      <div className="flex justify-around items-center h-16">
        {links.map((link) => {
          const isActive =
            link.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(link.href);
          const Icon = link.icon;

          return (
            <Link
              key={link.href}
              href={link.href}
              className={[
                'flex flex-col items-center justify-center w-full h-full transition-colors duration-150',
                isActive ? activeColor : `text-gray-400 ${hoverColor}`,
              ].join(' ')}
            >
              <Icon
                className="w-6 h-6 mb-0.5"
                strokeWidth={isActive ? 2.5 : 1.8}
              />
              <span className="text-[10px] font-semibold tracking-wide">
                {link.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
