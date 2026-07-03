import { Gemini } from './gemini.js';

// Wspólna logika tłumaczenia interfejsu (PL/EN), reużywana zarówno przez główną aplikację
// (js/app.js), jak i samodzielne podstrony bez własnego "App" (np. polityka-prywatnosci.html) -
// dzięki temu obie korzystają z DOKŁADNIE tego samego cache'u (localStorage) i tego samego
// mechanizmu chodzenia po DOM, więc tłumaczenie jednej strony nie różni się od drugiej.
export const I18n = {
    // Klucz cache'u zawiera numer wersji aplikacji (czytany z nagłówka) - aktualizacja treści
    // strony w nowej wersji automatycznie unieważnia stare tłumaczenia.
    getCacheKey() {
        const versionEl = document.querySelector('.logo-version');
        return 'saf_i18n_en_' + (versionEl ? versionEl.textContent.trim() : 'unknown');
    },

    getCache() {
        try {
            return JSON.parse(localStorage.getItem(this.getCacheKey()) || '{}');
        } catch {
            return {};
        }
    },

    saveCache(cache) {
        try {
            localStorage.setItem(this.getCacheKey(), JSON.stringify(cache));
        } catch (e) {
            console.warn('[i18n] Nie udało się zapisać cache tłumaczeń:', e.message);
        }
    },

    // Chodzi po CAŁYM document.body i zbiera węzły tekstowe + atrybuty placeholder/title/
    // aria-label do przetłumaczenia - pomijając WARTOŚCI <textarea>/<input> (to dane użytkownika/
    // AI - notatki, treść artykułu - MAJĄ zostać po polsku niezależnie od języka interfejsu) oraz
    // elementy oznaczone data-no-translate.
    collectNodes() {
        const nodes = [];
        const isSkipped = (el) => !!(el.closest && el.closest('[data-no-translate]'));

        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
            acceptNode: (node) => {
                if (!node.textContent || !node.textContent.trim()) return NodeFilter.FILTER_REJECT;
                const parent = node.parentElement;
                if (!parent) return NodeFilter.FILTER_REJECT;
                if (parent.closest('textarea, input, script, style')) return NodeFilter.FILTER_REJECT;
                if (isSkipped(parent)) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });

        let node;
        while ((node = walker.nextNode())) {
            nodes.push({ type: 'text', node, original: node.textContent });
        }

        document.body.querySelectorAll('[placeholder], [title], [aria-label]').forEach(el => {
            if (isSkipped(el)) return;
            ['placeholder', 'title', 'aria-label'].forEach(attr => {
                const val = el.getAttribute(attr);
                if (val && val.trim()) nodes.push({ type: 'attr', node: el, attr, original: val });
            });
        });

        return nodes;
    },

    applyNodes(nodes, cache) {
        nodes.forEach(n => {
            const translated = cache[n.original];
            if (!translated) return;
            if (n.type === 'text') n.node.textContent = translated;
            else n.node.setAttribute(n.attr, translated);
        });
    },

    // Dopisuje do cache'u tłumaczenia wszystkich jeszcze nieprzetłumaczonych stringów spośród
    // "extraStrings" (typowo znane teksty dynamiczne z app.js, patrz KNOWN_DYNAMIC_STRINGS) oraz
    // węzłów statycznych bieżącej strony - w JEDNYM zbiorczym wywołaniu Gemini.translateStrings.
    // Celowo rzuca błąd, jeśli się nie uda (fail-loud) - wołający decyduje, co wtedy pokazać
    // użytkownikowi (patrz App.switchLanguage).
    async ensureReady(extraStrings = []) {
        const cache = this.getCache();
        const nodes = this.collectNodes();
        const candidates = new Set(extraStrings);
        nodes.forEach(n => candidates.add(n.original));

        const missing = Array.from(candidates).filter(s => !cache[s]);
        if (missing.length === 0) return cache;

        const translations = await Gemini.translateStrings(missing);
        missing.forEach((s, i) => { cache[s] = translations[i]; });
        this.saveCache(cache);
        return cache;
    },

    // Samodzielne zastosowanie angielskiego na CAŁEJ bieżącej stronie - używane przez podstrony
    // bez własnego "App" (np. polityka prywatności). Jeśli cache nie jest jeszcze pełny, dotłumaczy
    // brakujące teksty (rzuci błąd, jeśli się nie uda - wołający łapie wyjątek).
    async applyEnglish(extraStrings = []) {
        const cache = await this.ensureReady(extraStrings);
        this.applyNodes(this.collectNodes(), cache);
    }
};
