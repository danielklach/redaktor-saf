// Dedykowany Web Worker do dekodowania i kompresji zdjęć.
// Celowo NIE jest to worker modułowy (brak "type: module" przy tworzeniu w compressor.js),
// bo biblioteki do TIFF/DNG (UTIF.js) i HEIC/HEIF (libheif-js) są klasycznymi skryptami
// ładowanymi przez importScripts() - to pozwala trzymać całe, potencjalnie długie
// dekodowanie POZA głównym wątkiem, więc UI nigdy się nie zawiesza.

const HARD_LIMIT_BYTES = 204800; // twardy limit wagi: 200 KB

// Dłuższy bok ZAWSZE ma dokładnie tyle pikseli - niezależnie czy zdjęcie trzeba
// pomniejszyć, czy powiększyć (patrz wymóg użytkownika: spójny rozmiar na stronie).
const TARGET_LONG_SIDE = 2500;

// Skoro rozdzielczość jest teraz stała, jedyną dźwignią do zejścia poniżej twardego
// limitu wagi zostaje jakość kompresji - kolejne "raty ratunkowe" schodzą coraz niżej.
const QUALITY_ATTEMPTS = [0.65, 0.55, 0.48, 0.40, 0.32, 0.25, 0.18, 0.12, 0.08, 0.05];

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

async function decodeTiffLike(file, id, index) {
    try {
        ensureUTIF();
    } catch (err) {
        throw new Error(`"${file.name}": nie udało się pobrać biblioteki do odczytu TIFF/DNG (sprawdź połączenie z siecią). ${err?.message || ''}`);
    }
    if (typeof UTIF === 'undefined') {
        throw new Error(`"${file.name}": biblioteka do odczytu TIFF/DNG nie została poprawnie wczytana.`);
    }
    // Zgłaszamy postęp TUŻ PO ewentualnym (potencjalnie wolnym, pierwszorazowym) pobraniu
    // biblioteki z CDN, PRZED właściwym, ciężkim dekodowaniem - dzięki temu watchdog w
    // compressor.js (patrz PER_FILE_TIMEOUT_MS) ma dodatkowy punkt kontrolny do zresetowania
    // się w trakcie tego etapu, zamiast jednej długiej "cichej" przerwy między 5% a 30%.
    report(id, index, 'dekodowanie', 15);

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

async function decodeHeic(file, id, index) {
    let mod;
    try {
        mod = ensureHeif();
    } catch (err) {
        throw new Error(`"${file.name}": nie udało się pobrać biblioteki do odczytu HEIC/HEIF (sprawdź połączenie z siecią). ${err?.message || ''}`);
    }
    if (!mod || typeof mod.HeifDecoder !== 'function') {
        throw new Error(`"${file.name}": biblioteka do odczytu HEIC/HEIF nie została poprawnie wczytana.`);
    }
    report(id, index, 'dekodowanie', 15); // patrz komentarz w decodeTiffLike

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

function computeTargetDims(w, h) {
    if (w >= h) {
        const scale = TARGET_LONG_SIDE / w;
        return { w: TARGET_LONG_SIDE, h: Math.max(1, Math.round(h * scale)) };
    }
    const scale = TARGET_LONG_SIDE / h;
    return { w: Math.max(1, Math.round(w * scale)), h: TARGET_LONG_SIDE };
}

async function processFile(id, index, file) {
    const ext = getExtension(file.name);
    report(id, index, 'dekodowanie', 5);

    let bitmap;
    if (ext === 'tiff' || ext === 'tif' || ext === 'dng') {
        bitmap = await decodeTiffLike(file, id, index);
    } else if (ext === 'heic' || ext === 'heif') {
        bitmap = await decodeHeic(file, id, index);
    } else {
        bitmap = await decodeStandard(file);
    }
    report(id, index, 'kompresja', 30);

    // Oryginalne proporcje (do sprawdzania reguły 2:3 / 3:2 / 4:5 na głównym wątku) liczymy
    // z bitmapy PRZED przeskalowaniem - skalowanie do stałego długiego boku zachowuje proporcje.
    const originalWidth = bitmap.width;
    const originalHeight = bitmap.height;

    // Rysujemy RAZ na docelowym, stałym rozmiarze (dłuższy bok zawsze 2500px - w górę lub w dół),
    // a kolejne próby tylko obniżają jakość kompresji na tym samym canvasie, żeż zmieścić się w limicie wagi.
    const { w, h } = computeTargetDims(originalWidth, originalHeight);
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('OffscreenCanvas 2D nie jest dostępny w tym środowisku.');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    let finalBlob = null;
    for (let i = 0; i < QUALITY_ATTEMPTS.length; i++) {
        const quality = QUALITY_ATTEMPTS[i];
        finalBlob = await canvas.convertToBlob({ type: 'image/webp', quality });
        if (!finalBlob) throw new Error('Kodowanie do WebP nie powiodło się.');
        const pct = 30 + Math.round(((i + 1) / QUALITY_ATTEMPTS.length) * 65);
        report(id, index, 'kompresja', pct);
        if (finalBlob.size <= HARD_LIMIT_BYTES) break;
    }

    return { blob: finalBlob, originalWidth, originalHeight };
}

self.onmessage = async (e) => {
    const msg = e.data;
    if (!msg || msg.type !== 'process') return;
    const { id, index, file } = msg;

    try {
        const { blob, originalWidth, originalHeight } = await processFile(id, index, file);
        self.postMessage({ type: 'done', id, index, size: blob.size, blob, originalWidth, originalHeight });
    } catch (err) {
        self.postMessage({ type: 'error', id, index, message: err?.message || String(err) });
    }
};
