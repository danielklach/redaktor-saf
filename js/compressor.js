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
            const allowedFormats = ['jpg', 'jpeg', 'png', 'tiff', 'tif', 'dng', 'webp', 'heic', 'gif', 'avif', 'heif', 'bmp'];
            const fileExt = file.name.split('.').pop().toLowerCase();

            if (!allowedFormats.includes(fileExt)) {
                reject(new Error(`"${file.name}" ma błędny format (.${fileExt}). Obsługiwane pliki to: ${allowedFormats.join(', ')}.`));
                return;
            }

            let settled = false;
            const timeoutId = setTimeout(() => {
                if (settled) return;
                settled = true;
                reject(new Error(`Czas przetwarzania "${file.name}" minął. Plik jest uszkodzony lub przeglądarka nie wspiera tego formatu natywnie.`));
            }, 15000);

            const settle = (fn, arg) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeoutId);
                fn(arg);
            };

            const reader = new FileReader();
            reader.onerror = () => settle(reject, new Error(`Błąd odczytu pliku "${file.name}".`));
            
            reader.onload = (event) => {
                const img = new Image();
                
                // Błyskawiczne złapanie błędu dekodowania, np. dla DNG/TIFF w Chrome
                img.onerror = () => settle(reject, new Error(`Przeglądarka nie potrafi natywnie wyświetlić pliku "${file.name}" (najczęściej HEIC, TIFF lub DNG). Skonwertuj plik na JPG.`));
                
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
                                if (!ctx) { rejBlob(new Error('Brak wsparcia dla Canvas 2D.')); return; }
                                ctx.drawImage(img, 0, 0, w, h);
                                canvas.toBlob((b) => b ? resBlob(b) : rejBlob(new Error('Błąd kompresji do WebP.')), 'image/webp', quality);
                            });
                        };

                        let finalBlob = await compress(1920, 0.65);

                        // Agresywna, ale wydajna pętla wymuszająca twardy limit 200 KB
                        let quality = 0.65;
                        let maxDimension = 1920;
                        while (finalBlob.size > 204800 && quality > 0.1) {
                            quality -= 0.15;
                            if (quality <= 0.3) {
                                maxDimension = Math.round(maxDimension * 0.8);
                                quality = 0.5; // zresetowanie jakości przy mniejszej rozdzielczości
                            }
                            finalBlob = await compress(maxDimension, quality);
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