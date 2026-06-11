'use client';

import { useState } from 'react';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export default function LogoutButton({ logoutAction }: { logoutAction: () => Promise<void> }) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    setLoading(true);
    try {
      // 1. Clear LocalStorage
      localStorage.removeItem('snms_user');
      localStorage.removeItem('snms_last_sync');
      
      // 2. Clear IndexedDB completely to wipe offline cache
      if (window.indexedDB) {
        window.indexedDB.deleteDatabase('snms_db');
      }

      // 3. Clear auth cookies on server
      await logoutAction();
      
      // 4. Force hard redirect to login so the app state resets
      window.location.href = '/login';
    } catch (e) {
      console.error('Error during logout:', e);
      window.location.href = '/login';
    }
  };

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className="w-full bg-red-600 hover:bg-red-700 text-white font-black text-base p-4 rounded-2xl active:scale-95 transition-transform shadow-md disabled:opacity-50"
    >
      {loading ? t('clearingData') : t('logoutAndClear')}
    </button>
  );
}
