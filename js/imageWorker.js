// Dedykowany Web Worker do dekodowania i kompresji zdjęć.
// Celowo NIE jest to worker modułowy (brak "type: module" przy tworzeniu w compressor.js),
// bo biblioteki do TIFF/DNG (UTIF.js) i HEIC/HEIF (libheif-js) są klasycznymi skryptami
// ładowanymi przez importScripts() - to pozwala trzymać całe, potencjalnie długie
// dekodowanie POZA głównym wątkiem, więc UI nigdy się nie zawiesza.

const HARD_LIMIT_BYTES = 204800; // twardy limit wagi: 200 KB

// Kolejne "raty" ratunkowe: zaczynamy od dobrej jakości, a jeśli waga wciąż
// przekracza limit, schodzimy niżej z rozdzielczością i jakością - aż do skutku.
const ATTEMPTS = [
    { maxSide: 1920, quality: 0.65 },
    { maxSide: 1600, quality: 0.55 },
    { maxSide: 1400, quality: 0.50 },
    { maxSide: 1100, quality: 0.42 },
    { maxSide: 900,  quality: 0.35 },
    { maxSide: 700,  quality: 0.28 },
    { maxSide: 500,  quality: 0.20 }
];

const UTIF_URL = 'https://cdn.jsdelivr.net/npm/utif2@4/UTIF.js';
const LIBHEIF_URL = 'https://cdn.jsdelivr.net/npm/libheif-js@1.19.8/libheif-wasm/libheif-bundle.js';

let utifReady = false;
let heifModule = null;

function ensureUTIF() {
    if (utifReady && typeof UTIF !== 'undefined') return;
    importScripts(UTIF_URL);
    utifReady = true;
}

// libheif-js (wariant "bundle") eksportuje FABRYKĘ modułu Emscripten, nie gotowy
// obiekt - trzeba ją wywołać, żeby dostać moduł z klasą HeifDecoder.
function ensureHeif() {
    if (heifModule) return heifModule;
    if (typeof libheif === 'undefined') importScripts(LIBHEIF_URL);
    heifModule = (typeof libheif === 'function') ? libheif() : libheif;
    return heifModule;
}

function getExtension(fileName) {
    const m = /\.([a-z0-9]+)$/i.exec(fileName || '');
    return m ? m[1].toLowerCase() : '';
}

function report(id, index, stage, pct) {
    self.postMessage({ type: 'progress', id, index, stage, pct });
}

async function decodeTiffLike(file) {
    try {
        ensureUTIF();
    } catch (err) {
        throw new Error(`"${file.name}": nie udało się pobrać biblioteki do odczytu TIFF/DNG (sprawdź połączenie z siecią). ${err?.message || ''}`);
    }
    if (typeof UTIF === 'undefined') {
        throw new Error(`"${file.name}": biblioteka do odczytu TIFF/DNG nie została poprawnie wczytana.`);
    }

    const buf = await file.arrayBuffer();
    let ifds;
    try {
        ifds = UTIF.decode(buf);
    } catch (err) {
        throw new Error(`"${file.name}": plik jest uszkodzony lub nie jest prawidłowym TIFF/DNG (${err?.message || err}).`);
    }
    if (!ifds || !ifds.length) {
        throw new Error(`"${file.name}": nie znaleziono żadnej klatki obrazu w pliku.`);
    }

    // W plikach DNG (RAW) bywa kilka "klatek" (miniatura, podgląd, surowe dane Bayer).
    // Próbujemy dekodować od największej rozdzielczości w dół - realny obraz RAW bez
    // demozaikowania i tak się nie zdekoduje, więc naturalnie trafimy na osadzony podgląd.
    const candidates = ifds.slice().sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0));
    let lastErr = null;
    for (const ifd of candidates) {
        try {
            UTIF.decodeImage(buf, ifd, ifds);
            if (!ifd.width || !ifd.height) continue;
            const rgba = UTIF.toRGBA8(ifd);
            if (!rgba || !rgba.length) continue;
            const imgData = new ImageData(new Uint8ClampedArray(rgba), ifd.width, ifd.height);
            return await createImageBitmap(imgData);
        } catch (err) {
            lastErr = err;
        }
    }
    throw new Error(`"${file.name}": nie udało się zdekodować obrazu z pliku TIFF/DNG (prawdopodobnie surowy plik RAW bez osadzonego podglądu lub nieobsługiwana kompresja). Wyeksportuj podgląd jako JPG/TIFF i spróbuj ponownie.${lastErr ? ' [' + (lastErr.message || lastErr) + ']' : ''}`);
}

async function decodeHeic(file) {
    let mod;
    try {
        mod = ensureHeif();
    } catch (err) {
        throw new Error(`"${file.name}": nie udało się pobrać biblioteki do odczytu HEIC/HEIF (sprawdź połączenie z siecią). ${err?.message || ''}`);
    }
    if (!mod || typeof mod.HeifDecoder !== 'function') {
        throw new Error(`"${file.name}": biblioteka do odczytu HEIC/HEIF nie została poprawnie wczytana.`);
    }

    const buf = await file.arrayBuffer();
    const decoder = new mod.HeifDecoder();
    let images;
    try {
        images = decoder.decode(buf);
    } catch (err) {
        throw new Error(`"${file.name}": plik jest uszkodzony lub nie jest prawidłowym HEIC/HEIF (${err?.message || err}).`);
    }
    if (!images || !images.length) {
        throw new Error(`"${file.name}": nie znaleziono obrazu w pliku HEIC/HEIF.`);
    }

    const image = images[0];
    const w = image.get_width();
    const h = image.get_height();
    const rgba = new Uint8ClampedArray(w * h * 4);

    await new Promise((resolve, reject) => {
        try {
            image.display({ data: rgba, width: w, height: h }, (displayData) => {
                if (!displayData) { reject(new Error(`"${file.name}": błąd dekodowania HEIC/HEIF.`)); return; }
                resolve();
            });
        } catch (err) {
            reject(new Error(`"${file.name}": błąd dekodowania HEIC/HEIF (${err?.message || err}).`));
        }
    });

    image.free?.();

    const imgData = new ImageData(rgba, w, h);
    return await createImageBitmap(imgData);
}

async function decodeStandard(file) {
    try {
        return await createImageBitmap(file);
    } catch (err) {
        throw new Error(`"${file.name}" nie jest prawidłowym lub wspieranym plikiem obrazu (${err?.message || err}).`);
    }
}

async function encodeAttempt(bitmap, maxSide, quality) {
    let w = bitmap.width, h = bitmap.height;
    if (w > h && w > maxSide) { h = Math.round((h * maxSide) / w); w = maxSide; }
    else if (h >= w && h > maxSide) { w = Math.round((w * maxSide) / h); h = maxSide; }

    const canvas = new OffscreenCanvas(Math.max(1, w), Math.max(1, h));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('OffscreenCanvas 2D nie jest dostępny w tym środowisku.');
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await canvas.convertToBlob({ type: 'image/webp', quality });
    if (!blob) throw new Error('Kodowanie do WebP nie powiodło się.');
    return blob;
}

async function processFile(id, index, file) {
    const ext = getExtension(file.name);
    report(id, index, 'dekodowanie', 5);

    let bitmap;
    if (ext === 'tiff' || ext === 'tif' || ext === 'dng') {
        bitmap = await decodeTiffLike(file);
    } else if (ext === 'heic' || ext === 'heif') {
        bitmap = await decodeHeic(file);
    } else {
        bitmap = await decodeStandard(file);
    }
    report(id, index, 'kompresja', 30);

    let finalBlob = null;
    for (let i = 0; i < ATTEMPTS.length; i++) {
        const cfg = ATTEMPTS[i];
        finalBlob = await encodeAttempt(bitmap, cfg.maxSide, cfg.quality);
        const pct = 30 + Math.round(((i + 1) / ATTEMPTS.length) * 65);
        report(id, index, 'kompresja', pct);
        if (finalBlob.size <= HARD_LIMIT_BYTES) break;
    }

    bitmap.close?.();
    return finalBlob;
}

self.onmessage = async (e) => {
    const msg = e.data;
    if (!msg || msg.type !== 'process') return;
    const { id, index, file } = msg;

    try {
        const finalBlob = await processFile(id, index, file);
        self.postMessage({ type: 'done', id, index, size: finalBlob.size, blob: finalBlob });
    } catch (err) {
        self.postMessage({ type: 'error', id, index, message: err?.message || String(err) });
    }
};
