import en from './en';
import es from './es';
import fr from './fr';

type TranslationType = typeof en;

const translations: Record<string, TranslationType> = {
  en,
  es,
  fr,
};

class LocalizationService {
  private currentLocale: string;

  constructor(defaultLocale: string = 'en') {
    this.currentLocale = defaultLocale;
  }

  setLocale(locale: string): void {
    if (translations[locale]) {
      this.currentLocale = locale;
    } else {
      console.warn(`Locale '${locale}' not found, falling back to 'en'`);
      this.currentLocale = 'en';
    }
  }

  getLocale(): string {
    return this.currentLocale;
  }

  translate(path: string, ...args: any[]): string {
    const keys = path.split('.');
    let translation: any = translations[this.currentLocale];

    for (const key of keys) {
      if (translation != null && translation[key] !== undefined) {
        translation = translation[key];
      }
      else {
        translation = translations['en'];
        for (const k of keys) {
          if (translation != null && translation[k] !== undefined) {
            translation = translation[k];
          } else {
            return path;
          }
        }
        break;
      }
    }

    if (typeof translation !== 'string') {
      return path;
    }

    if (args.length === 1 && args[0] !== null
        && typeof args[0] === 'object'
        && !Array.isArray(args[0])) {
      const map = args[0] as Record<string, any>;
      return translation.replace(/\{\{([^}]+)\}\}/g, (_, prop) => {
        const val = map[prop];
        return val !== undefined ? String(val) : '';
      });
    }

    return translation.replace(/\{(\d+)\}/g, (_, idx) => {
      const i = parseInt(idx, 10);
      return args[i] !== undefined ? String(args[i]) : '';
    });
  }

  t(path: string, ...args: any[]): string {
    return this.translate(path, ...args);
  }
}

const i18n = new LocalizationService();
export default i18n;
