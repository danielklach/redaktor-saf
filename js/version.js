// Jedyne miejsce z numerem wersji i datą wydania Redaktora SAFi - edytuj TYLKO tutaj (NIE w
// plikach index.html / social-media.html / polityka-prywatnosci.html), a wszystkie strony
// automatycznie się zaktualizują. To ten sam trik co przy stopce (patrz App.renderFooterVersion/
// SocialApp.renderFooterVersion, które CZYTAJĄ wersję z nagłówka) - tylko jeden poziom wyżej: teraz
// to nagłówek na każdej stronie czyta wersję stąd, zamiast mieć ją wpisaną na sztywno w HTML-u.
export const APP_VERSION = '1.13.3';
export const APP_RELEASE_DATE = '2026-07-05';

// Wołane z App.init()/SocialApp.init() oraz z inline-modułu w polityka-prywatnosci.html, ZANIM
// cokolwiek czyta ".logo-version" (np. renderFooterVersion, I18n.buildCacheKey) - patrz wywołania.
export function applyVersion() {
    const versionEl = document.querySelector('.logo-version');
    if (!versionEl) return;
    versionEl.textContent = `ver. ${APP_VERSION}`;
    versionEl.dataset.releaseDate = APP_RELEASE_DATE;
}
