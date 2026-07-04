// Klient dla wspólnej, edytowalnej przez cały zespół bazy fotografów/jednostek (v1.13.0) - backend
// to Google Apps Script Web App przypisany do prywatnego Dokumentu agencji (patrz
// apps-script/photo-db.gs). Wzorowane na Gemini.sendIssueReport w js/gemini.js: POST celowo BEZ
// jawnego "Content-Type" (fetch domyślnie ustawia text/plain dla treści-stringa), żeby uniknąć
// zapytania "preflight" (OPTIONS), którego Apps Script nie obsługuje.
//
// Adres wdrożenia Google Apps Script (Web App) obsługującego apps-script/photo-db.gs - jeśli
// kiedyś trzeba będzie go zmienić, pamiętaj o tej samej zasadzie co przy REPORT_SCRIPT_URL w
// js/gemini.js: wdrażaj jako NOWĄ WERSJĘ TEGO SAMEGO wdrożenia, nie jako zupełnie nowe wdrożenie -
// inaczej ten adres przestanie działać.
const PHOTO_DB_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwxkV0DZ4yO50NvcAMBQA1JMglPQotJogBGCerqKhMoXIYiDuFomIOWIUkp1OWXUfAH4g/exec";

export const PhotoDb = {
    async _get(type) {
        if (!PHOTO_DB_SCRIPT_URL || PHOTO_DB_SCRIPT_URL.includes('TWOJ-ADRES')) {
            throw new Error('Baza fotografów/jednostek nie jest jeszcze skonfigurowana (patrz apps-script/photo-db.gs).');
        }
        const response = await fetch(`${PHOTO_DB_SCRIPT_URL}?type=${type}`);
        if (!response.ok) throw new Error(`Serwer bazy odpowiedział błędem (status ${response.status}).`);
        const data = await response.json();
        if (data.status !== 'success') throw new Error(data.message || 'Nieznany błąd bazy fotografów/jednostek.');
        return Array.isArray(data.data) ? data.data : [];
    },

    async _post(payload) {
        if (!PHOTO_DB_SCRIPT_URL || PHOTO_DB_SCRIPT_URL.includes('TWOJ-ADRES')) {
            throw new Error('Baza fotografów/jednostek nie jest jeszcze skonfigurowana (patrz apps-script/photo-db.gs).');
        }
        const response = await fetch(PHOTO_DB_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error(`Serwer bazy odpowiedział błędem (status ${response.status}).`);
        const data = await response.json();
        if (data.status !== 'success') throw new Error(data.message || 'Nieznany błąd bazy fotografów/jednostek.');
    },

    // -> [{name, handle, altNames: []}]
    async getPhotographers() {
        return this._get('photographers');
    },

    // -> [{name, handle, keywords: []}]
    async getUnits() {
        return this._get('units');
    },

    // Dopisuje NOWY wpis albo aktualizuje ISTNIEJĄCY (dopasowanie po "name", po stronie Apps
    // Script) - bezpieczne do wołania nawet dla już znanej osoby (np. samo potwierdzenie uchwytu).
    async upsertPhotographer({ name, handle, altNames }) {
        return this._post({ action: 'addPhotographer', name, handle, altNames });
    },

    async upsertUnit({ name, handle, keywords }) {
        return this._post({ action: 'addUnit', name, handle, keywords });
    }
};
