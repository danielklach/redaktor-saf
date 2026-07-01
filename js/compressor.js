export const Compressor = {
    processedFiles: [],

    sanitizeString(str) {
        return str.toLowerCase()
            .replace(/ą/g, 'a').replace(/ć/g, 'c').replace(/ę/g, 'e')
            .replace(/ł/g, 'l').replace(/ń/g, 'n').replace(/ó/g, 'o')
            .replace(/ś/g, 's').replace(/ź/g, 'z').replace(/ż/g, 'z')
            .replace(/[^a-z0-9\s-_]/g, '')
            .replace(/[\s_]+/g, '-');
    },

    processImage(file, targetIndex, eventTitle, eventDateStr) {
        return new Promise((resolve, reject) => {
            // NAPRAWA ZAWIESZKI: pliki, które przeglądarka nie umie zdekodować w <img> (najczęściej
            // HEIC/HEIF z iPhone'a, ale też RAW z aparatu, PDF-y czy inne pliki wrzucone przez drag&drop -
            // atrybut accept="image/*" NIE filtruje przeciąganych plików) wcześniej nie miały żadnej
            // obsługi błędu ani limitu czasu. Efekt: "img.onload" nigdy się nie odpalał i CAŁA kolejka
            // stała w miejscu w nieskończoność, bez żadnego komunikatu. Poniżej: wczesne odrzucenie
            // nieobsługiwanych formatów + reject przy błędzie + twardy limit czasu jako siatka bezpieczeństwa.
            const isHeic = /\.(heic|heif)$/i.test(file.name) || /heic|heif/i.test(file.type || '');
            if (isHeic) {
                reject(new Error(`"${file.name}" to format HEIC/HEIF (typowy dla iPhone'a) - przeglądarki na komputerze nie umieją go podglądać. Przekonwertuj plik na JPG i wgraj ponownie.`));
                return;
            }
            if (file.type && !file.type.startsWith('image/')) {
                reject(new Error(`"${file.name}" nie jest rozpoznawany jako obraz (typ: ${file.type}) i został pominięty.`));
                return;
            }

            let settled = false;
            const timeoutId = setTimeout(() => {
                if (settled) return;
                settled = true;
                reject(new Error(`"${file.name}" przetwarzał się dłużej niż 20 sekund i został pominięty (prawdopodobnie nieobsługiwany lub uszkodzony plik).`));
            }, 20000);
            const settle = (fn, arg) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeoutId);
                fn(arg);
            };

            const reader = new FileReader();
            reader.onerror = () => settle(reject, new Error(`Nie udało się wczytać pliku "${file.name}".`));
            reader.onload = (event) => {
                const img = new Image();
                img.onerror = () => settle(reject, new Error(`"${file.name}" nie jest prawidłowym lub wspieranym plikiem obrazu.`));
                img.onload = async () => {
                    try {
                        const compress = (maxSide, quality) => {
                            return new Promise((resBlob, rejBlob) => {
                                const canvas = document.createElement('canvas');
                                let w = img.width, h = img.height;

                                if (w > h && w > maxSide) { h = Math.round((h * maxSide) / w); w = maxSide; }
                                else if (h > w && h > maxSide) { w = Math.round((w * maxSide) / h); h = maxSide; }

                                canvas.width = w; canvas.height = h;
                                const ctx = canvas.getContext('2d');
                                if (!ctx) { rejBlob(new Error('Canvas 2D nie jest dostępny w tej przeglądarce.')); return; }
                                ctx.drawImage(img, 0, 0, w, h);
                                canvas.toBlob((b) => b ? resBlob(b) : rejBlob(new Error('Kodowanie do WebP nie powiodło się.')), 'image/webp', quality);
                            });
                        };

                        // Strategia błyskawiczna 2-fazowa (Limit twardy: 200KB = 204800 bajtów)
                        // Faza 1: Szerokość do 1920px, jakość 0.65 (Zwykle waga wynosi około 120-170KB)
                        let finalBlob = await compress(1920, 0.65);

                        // Faza ratunkowa (tylko jeśli zdjęcie jest wybitnie zaszumione lub szczegółowe)
                        if (finalBlob.size > 204800) {
                            finalBlob = await compress(1400, 0.50);
                        }

                        const dateObj = new Date(eventDateStr || Date.now());
                        const year = dateObj.getFullYear();
                        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                        const safeTitle = Compressor.sanitizeString(eventTitle || 'wydarzenie');
                        const numStr = String(targetIndex + 1).padStart(2, '0');
                        const fileName = `${year}-${month}-${safeTitle}-${numStr}.webp`;

                        settle(resolve, {
                            blob: finalBlob,
                            name: fileName,
                            size: finalBlob.size,
                            previewUrl: event.target.result,
                            wpPath: `/wp-content/uploads/${year}/${month}/${fileName}`
                        });
                    } catch (err) {
                        settle(reject, err);
                    }
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        });
    },

    async generateZip(eventTitle, eventDateStr) {
        if (this.processedFiles.length === 0) return;
        const zip = new JSZip();
        this.processedFiles.forEach(file => {
            zip.file(file.name, file.blob);
        });
        
        const dateObj = new Date(eventDateStr || Date.now());
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const safeTitle = this.sanitizeString(eventTitle || 'wydarzenie');
        
        const content = await zip.generateAsync({ type: "blob" });
        const url = window.URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${year}-${month}-${safeTitle}.zip`;
        a.click();
    }
};