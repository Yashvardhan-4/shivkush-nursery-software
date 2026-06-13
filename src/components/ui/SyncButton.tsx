'use client';

import { useState } from 'react';
import { useSync } from '@/components/providers/OfflineSyncProvider';
import { RefreshCw, Check, XCircle } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export function SyncButton() {
  const { isSyncing, forceSync } = useSync();
  const { t } = useLanguage();
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleSync = async () => {
    try {
      await forceSync();
      setStatus('success');
      setTimeout(() => setStatus('idle'), 2000);
    } catch (err) {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  return (
    <button
      onClick={handleSync}
      disabled={isSyncing || status !== 'idle'}
      className={`flex items-center space-x-2 px-3 py-1.5 rounded-full text-xs font-bold border shadow-sm active:scale-95 transition-all disabled:opacity-50 ${
        status === 'success' ? 'bg-green-600 text-white border-green-700' :
        status === 'error' ? 'bg-red-600 text-white border-red-700' :
        'bg-green-50 text-green-700 border-green-200'
      }`}
    >
      {status === 'success' ? <Check className="w-3.5 h-3.5" /> :
       status === 'error' ? <XCircle className="w-3.5 h-3.5" /> :
       <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />}
      <span>
        {status === 'success' ? 'Synced' :
         status === 'error' ? 'Failed' :
         isSyncing ? t('Syncing...') : t('Sync Now')}
      </span>
    </button>
  );
}
