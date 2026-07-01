// Cała ciężka praca (dekodowanie plików + kompresja) odbywa się w puli Web Workerów
// (patrz js/imageWorker.js). Dzięki temu główny wątek NIGDY nie jest blokowany -
// nawet przy dużych plikach TIFF/DNG/HEIC, UI zostaje responsywne, a pasek postępu
// pokazuje realny, a nie symulowany postęp.
export const Compressor = {
    processedFiles: [],

    // Profesjonalne formaty obsługiwane przez aplikację. Wszystko inne = natychmiastowy błąd.
    ALLOWED_EXTENSIONS: ['jpg', 'jpeg', 'png', 'tiff', 'tif', 'dng', 'webp', 'heic', 'gif', 'avif', 'heif', 'bmp'],

    _workers: [],
    _rrIndex: 0,
    _pending: new Map(),
    _msgSeq: 0,

    getExtension(fileName) {
        const m = /\.([a-z0-9]+)$/i.exec(fileName || '');
        return m ? m[1].toLowerCase() : '';
    },

    isSupportedFormat(file) {
        return this.ALLOWED_EXTENSIONS.includes(this.getExtension(file?.name));
    },

    sanitizeString(str) {
        return str.toLowerCase()
            .replace(/ą/g, 'a').replace(/ć/g, 'c').replace(/ę/g, 'e')
            .replace(/ł/g, 'l').replace(/ń/g, 'n').replace(/ó/g, 'o')
            .replace(/ś/g, 's').replace(/ź/g, 'z').replace(/ż/g, 'z')
            .replace(/[^a-z0-9\s-_]/g, '')
            .replace(/[\s_]+/g, '-');
    },

    _ensureWorkerPool() {
        if (this._workers.length) return;
        const n = Math.max(1, Math.min(4, navigator.hardwareConcurrency || 2));
        for (let i = 0; i < n; i++) this._spawnWorker(i);
    },

    _spawnWorker(slot) {
        const worker = new Worker(new URL('./imageWorker.js', import.meta.url));
        worker.onmessage = (e) => this._onWorkerMessage(e.data);
        worker.onerror = () => {
            // Awaria wątku (np. błąd sieci przy pobieraniu biblioteki TIFF/HEIC) nie może
            // zawiesić kolejki na zawsze - odrzucamy wszystko, co było na nim w toku, i odtwarzamy wątek.
            for (const [id, pending] of this._pending) {
                if (pending.workerSlot !== slot) continue;
                clearTimeout(pending.timeoutId);
                this._pending.delete(id);
                pending.reject(new Error('Wewnętrzny błąd wątku przetwarzania obrazów.'));
            }
            this._spawnWorker(slot);
        };
        this._workers[slot] = worker;
        return worker;
    },

    _onWorkerMessage(data) {
        const pending = this._pending.get(data.id);
        if (!pending) return;

        if (data.type === 'progress') {
            pending.onProgress?.(data.stage, data.pct);
            return;
        }

        clearTimeout(pending.timeoutId);
        this._pending.delete(data.id);

        if (data.type === 'done') {
            pending.resolve({ blob: data.blob, size: data.size, width: data.originalWidth, height: data.originalHeight });
        } else if (data.type === 'error') {
            pending.reject(new Error(data.message));
        }
    },

    // Zleca dekodowanie + kompresję jednemu z workerów w puli. Zwraca gotowy, nazwany plik.
    processImage(file, targetIndex, eventTitle, eventDateStr, onProgress) {
        this._ensureWorkerPool();
        const id = ++this._msgSeq;
        const workerSlot = this._rrIndex;
        this._rrIndex = (this._rrIndex + 1) % this._workers.length;
        const worker = this._workers[workerSlot];

        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                this._pending.delete(id);
                reject(new Error(`"${file.name}" przetwarzał się dłużej niż 45 sekund i został pominięty (prawdopodobnie nieobsługiwany lub uszkodzony plik).`));
            }, 45000);

            this._pending.set(id, {
                workerSlot,
                timeoutId,
                onProgress,
                resolve: (result) => resolve(this._nameResult(result, targetIndex, eventTitle, eventDateStr)),
                reject
            });

            worker.postMessage({ type: 'process', id, index: targetIndex, file });
        });
    },

    _nameResult(result, targetIndex, eventTitle, eventDateStr) {
        const dateObj = new Date(eventDateStr || Date.now());
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const safeTitle = this.sanitizeString(eventTitle || 'wydarzenie');
        const numStr = String(targetIndex + 1).padStart(2, '0');
        const fileName = `${year}-${month}-${safeTitle}-${numStr}.webp`;

        return {
            blob: result.blob,
            name: fileName,
            size: result.size,
            width: result.width,
            height: result.height,
            previewUrl: URL.createObjectURL(result.blob),
            wpPath: `/wp-content/uploads/${fileName}`,
            isFeatured: false
        };
    },

    // Nazwa folderu/paczki wspólna dla ZIP-a i zapisu bezpośredniego na dysk (np. "2026-05-koncert").
    getFolderName(eventTitle, eventDateStr) {
        const dateObj = new Date(eventDateStr || Date.now());
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const safeTitle = this.sanitizeString(eventTitle || 'wydarzenie');
        return `${year}-${month}-${safeTitle}`;
    },

    async generateZip(eventTitle, eventDateStr) {
        if (this.processedFiles.length === 0) return;
        const zip = new JSZip();
        this.processedFiles.forEach(file => {
            zip.file(file.name, file.blob);
        });

        const content = await zip.generateAsync({ type: "blob" });
        const url = window.URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.getFolderName(eventTitle, eventDateStr)}.zip`;
        a.click();
    },

    // Zapisuje wszystkie przetworzone zdjęcia BEZPOŚREDNIO na dysk (File System Access API),
    // w podfolderze nazwanym jak wydarzenie - bez potrzeby pobierania i rozpakowywania ZIP-a.
    // Wymaga przeglądarki wspierającej showDirectoryPicker (Chrome/Edge - komputer i Android).
    async saveToDirectory(dirHandle, eventTitle, eventDateStr) {
        if (this.processedFiles.length === 0) return { folderName: null, count: 0 };

        const folderName = this.getFolderName(eventTitle, eventDateStr);
        const subDir = await dirHandle.getDirectoryHandle(folderName, { create: true });

        for (const file of this.processedFiles) {
            const fileHandle = await subDir.getFileHandle(file.name, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(file.blob);
            await writable.close();
        }

        return { folderName, count: this.processedFiles.length };
    }
};
