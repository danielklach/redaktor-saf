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
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = async () => {
                    const compress = (maxSide, quality) => {
                        return new Promise((resBlob) => {
                            const canvas = document.createElement('canvas');
                            let w = img.width, h = img.height;
                            
                            if (w > h && w > maxSide) { h = Math.round((h * maxSide) / w); w = maxSide; }
                            else if (h > w && h > maxSide) { w = Math.round((w * maxSide) / h); h = maxSide; }
                            
                            canvas.width = w; canvas.height = h;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(img, 0, 0, w, h);
                            canvas.toBlob((b) => resBlob(b), 'image/webp', quality);
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

                    resolve({
                        blob: finalBlob,
                        name: fileName,
                        size: finalBlob.size,
                        previewUrl: event.target.result,
                        wpPath: `/wp-content/uploads/${year}/${month}/${fileName}`
                    });
                };
            };
            reader.onerror = error => reject(error);
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