import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enTranslation from './locales/en.json';
import zhCnTranslation from './locales/zh-CN.json';

const LANGUAGE_STORAGE_KEY = 'netpath_lens_language_v1';

export const getInitialLanguage = (): string => {
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (saved && (saved === 'zh-CN' || saved === 'en')) {
      return saved;
    }
  } catch {
    // fallback
  }

  // Detect macOS system language
  if (typeof navigator !== 'undefined' && navigator.language) {
    if (navigator.language.toLowerCase().startsWith('zh')) {
      return 'zh-CN';
    }
  }
  return 'en';
};

const initialLang = getInitialLanguage();

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        translation: enTranslation,
      },
      'zh-CN': {
        translation: zhCnTranslation,
      },
    },
    lng: initialLang,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already escapes values
    },
  });

export const setAppLanguage = (lng: 'zh-CN' | 'en'): void => {
  i18n.changeLanguage(lng);
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lng);
  } catch (err) {
    console.error('Failed to save language preference:', err);
  }
};

export default i18n;
