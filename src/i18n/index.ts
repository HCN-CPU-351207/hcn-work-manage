// i18next + react-i18next, 7 ngôn ngữ, mặc định vi (mục 11)
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import vi from './vi.json';
import en from './en.json';
import zh from './zh.json';
import pt from './pt.json';
import fr from './fr.json';
import de from './de.json';
import ja from './ja.json';

export const LANG_META = [
  { code: 'vi', badge: 'VI', name: 'Tiếng Việt' },
  { code: 'en', badge: 'EN', name: 'English' },
  { code: 'zh', badge: 'ZH', name: '中文' },
  { code: 'pt', badge: 'PT', name: 'Português' },
  { code: 'fr', badge: 'FR', name: 'Français' },
  { code: 'de', badge: 'DE', name: 'Deutsch' },
  { code: 'ja', badge: 'JA', name: '日本語' }
] as const;

void i18n.use(initReactI18next).init({
  resources: {
    vi: { translation: vi },
    en: { translation: en },
    zh: { translation: zh },
    pt: { translation: pt },
    fr: { translation: fr },
    de: { translation: de },
    ja: { translation: ja }
  },
  lng: 'vi',
  fallbackLng: 'vi',
  interpolation: { escapeValue: false },
  returnNull: false
});

export default i18n;
