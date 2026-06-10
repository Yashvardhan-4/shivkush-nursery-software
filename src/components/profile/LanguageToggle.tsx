'use client';

import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Globe } from 'lucide-react';

export default function LanguageToggle() {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div className="flex justify-between items-center px-5 py-4">
      <div className="flex items-center space-x-2">
        <Globe className="w-5 h-5 text-gray-500" />
        <span className="text-sm font-semibold text-gray-500">{t('language')}</span>
      </div>
      <div className="flex bg-gray-100 rounded-lg p-1">
        <button
          onClick={() => setLanguage('en')}
          className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
            language === 'en' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {t('english')}
        </button>
        <button
          onClick={() => setLanguage('mr')}
          className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
            language === 'mr' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {t('marathi')}
        </button>
      </div>
    </div>
  );
}
