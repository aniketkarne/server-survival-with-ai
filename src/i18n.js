// Locale allowlist — the ONLY keys whose translations can be loaded.
// Adding a new translation file requires (1) adding the <script src="..."> tag in
// index.html, (2) registering the global (e.g. NEP_TRANSLATIONS) in the
// translations map below, AND (3) adding the key here. Out-of-sync state between
// these three causes a silent fallback to 'en' — by design.
const SUPPORTED_LOCALES = ['en', 'zh', 'pt-BR', 'de', 'fr'];
const DEFAULT_LOCALE = 'en';

/**
 * Simple i18n manager for the game
 */
class I18nManager {
    constructor() {
        this.translations = {
            en: typeof EN_TRANSLATIONS !== 'undefined' ? EN_TRANSLATIONS : {},
            zh: typeof ZH_TRANSLATIONS !== 'undefined' ? ZH_TRANSLATIONS : {},
            'pt-BR': typeof PT_BR_TRANSLATIONS !== 'undefined' ? PT_BR_TRANSLATIONS : {},
            de: typeof DE_TRANSLATIONS !== 'undefined' ? DE_TRANSLATIONS : {},
            fr: typeof FR_TRANSLATIONS !== 'undefined' ? FR_TRANSLATIONS : {}
        };

        // Persisted locale is user-controlled (any localStorage value). If it
        // does not match a supported key — typo, stale "nep" from an older
        // build, devtools edit — fall back to the default rather than letting
        // an undefined `translations[locale]` crash every t() call later.
        const stored = localStorage.getItem('game_locale');
        this.currentLocale = SUPPORTED_LOCALES.includes(stored)
            ? stored
            : DEFAULT_LOCALE;
        if (stored !== this.currentLocale) {
            // Rewrite so the bad value does not keep failing the check on reload.
            localStorage.setItem('game_locale', this.currentLocale);
        }
    }

    setLocale(locale) {
        if (!SUPPORTED_LOCALES.includes(locale)) return;
        if (!this.translations[locale]) return;
        this.currentLocale = locale;
        localStorage.setItem('game_locale', locale);
        this.applyTranslations();
        // Dispatch event for components that need to update manually
        window.dispatchEvent(new CustomEvent('localeChanged', { detail: locale }));
    }

    t(key, variables = {}) {
        let text = this.translations[this.currentLocale][key] || key;
        
        // Handle variable interpolation
        Object.keys(variables).forEach(varName => {
            text = text.replace(`{${varName}}`, variables[varName]);
        });
        
        return text;
    }

    applyTranslations() {
        // Update all elements with data-i18n attribute
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const translation = this.t(key);
            
            // Handle special cases like placeholder
            if (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'number')) {
                el.placeholder = translation;
            } else {
                // For other elements, update innerHTML or textContent
                // If it contains HTML tags (like <b>), use innerHTML
                if (translation.includes('<')) {
                    el.innerHTML = translation;
                } else {
                    el.textContent = translation;
                }
            }
        });

        // Update all elements with data-i18n-title attribute
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const titleKey = el.getAttribute('data-i18n-title');
            el.setAttribute('title', this.t(titleKey));
        });

        // Update document title
        document.title = this.t('title');

        // Update language select if it exists
        const langSelect = document.getElementById('lang-select');
        if (langSelect) {
            langSelect.value = this.currentLocale;
        }
    }
}

// Create a global instance
window.i18n = new I18nManager();

// Function to easily translate strings in JS
window.t = (key, variables) => window.i18n.t(key, variables);

// Auto-apply on load
document.addEventListener('DOMContentLoaded', () => {
    window.i18n.applyTranslations();
});
