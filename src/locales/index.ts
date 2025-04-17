import en from './en';
import es from './es';

type TranslationType = typeof en;

const translations: Record<string, TranslationType> = {
  en,
  es,
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
      if (translation[key] === undefined) {
        console.warn(`Translation key '${path}' not found in locale '${this.currentLocale}'`);
        // Intentar con el idioma por defecto
        translation = translations['en'];
        for (const fallbackKey of keys) {
          if (translation[fallbackKey] === undefined) {
            return path; // Si tampoco existe en el idioma por defecto, devolver la ruta
          }
          translation = translation[fallbackKey];
        }
        break;
      }
      translation = translation[key];
    }

    if (typeof translation !== 'string') {
      return path;
    }

    return translation.replace(/\{(\d+)\}/g, (match, index) => {
      return args[parseInt(index)] !== undefined ? String(args[parseInt(index)]) : match;
    });
  }

  t(path: string, ...args: any[]): string {
    return this.translate(path, ...args);
  }
}

const i18n = new LocalizationService();
export default i18n;
