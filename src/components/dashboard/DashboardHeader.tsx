'use client';

import { useLanguage } from '@/lib/i18n/LanguageContext';

interface DashboardHeaderProps {
  name: string;
  role: string;
}

export default function DashboardHeader({ name, role }: DashboardHeaderProps) {
  const { t } = useLanguage();

  return (
    <header className="flex justify-between items-center mb-6">
      <div>
        <h1 className="text-3xl font-extrabold text-green-900 tracking-tight">
          {t('welcome')}, {name}
        </h1>
        <p className="text-sm font-medium text-gray-500 capitalize mt-1">
          {role === 'owner' ? t('Owner Dashboard') : t('Worker Dashboard')}
        </p>
      </div>
      <div className="h-16 w-16 flex-shrink-0 relative flex items-center justify-center bg-white rounded-xl shadow-sm border border-gray-100 p-1">
        <img
          src="/Shivkush-Nursery-Logo.png"
          alt="Shivkush Nursery Logo"
          className="max-h-full max-w-full object-contain"
        />
      </div>
    </header>
  );
}
