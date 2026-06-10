'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import enDict from './en.json';
import mrDict from './mr.json';

type Language = 'en' | 'mr';

type Dictionary = typeof enDict;

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: keyof Dictionary) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('app_language') as Language;
    if (saved && (saved === 'en' || saved === 'mr')) {
      setLanguageState(saved);
    }
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('app_language', lang);
  };

  const t = (key: keyof Dictionary): string => {
    if (!mounted) return enDict[key] || key; // Default to English during SSR
    
    const dict = language === 'en' ? enDict : mrDict;
    return (dict as any)[key] || (enDict as any)[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
