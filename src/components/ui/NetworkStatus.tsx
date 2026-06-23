// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export function NetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const { t } = useLanguage();

  useEffect(() => {
    // Initial check
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="bg-red-500 text-white px-4 py-2 flex items-center justify-center space-x-2 text-sm font-medium z-50 sticky top-0 shadow-md">
      <WifiOff size={16} />
      <span>{t('offlineWarning') || 'You are offline. Critical actions are blocked until connection is restored.'}</span>
    </div>
  );
}
