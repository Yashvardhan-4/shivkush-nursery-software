'use client';

import { useSync } from '@/components/providers/OfflineSyncProvider';
import { RefreshCw } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export function SyncButton() {
  const { isSyncing, forceSync } = useSync();
  const { t } = useLanguage();

  return (
    <button
      onClick={() => forceSync()}
      disabled={isSyncing}
      className="flex items-center space-x-2 bg-green-50 text-green-700 px-3 py-1.5 rounded-full text-xs font-bold border border-green-200 shadow-sm active:scale-95 transition-all disabled:opacity-50"
    >
      <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
      <span>{isSyncing ? t('Syncing...') : t('Sync Now')}</span>
    </button>
  );
}
