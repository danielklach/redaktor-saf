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
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    const maxSide = 2500;

                    if (width > height && width > maxSide) {
                        height = Math.round((height * maxSide) / width);
                        width = maxSide;
                    } else if (height > width && height > maxSide) {
                        width = Math.round((width * maxSide) / height);
                        height = maxSide;
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    const dateObj = new Date(eventDateStr || Date.now());
                    const year = dateObj.getFullYear();
                    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                    const safeTitle = Compressor.sanitizeString(eventTitle || 'wydarzenie');
                    const numStr = String(targetIndex + 1).padStart(2, '0');
                    const fileName = `${year}-${month}-${safeTitle}-${numStr}.webp`;

                    // INTELIGENTNA PĘTLA KOMPRESJI DO MAX 200 KB (Punkt 3)
                    let quality = 0.85;
                    let finalBlob = null;
                    const maxSizeBytes = 200 * 1024; // Dokładnie 204800 bajtów

                    const compress = () => {
                        return new Promise((resBlob) => {
                            canvas.toBlob((b) => resBlob(b), 'image/webp', quality);
                        });
                    };

                    finalBlob = await compress();
                    
                    // Jeśli plik przekracza 200kb, stopniowo zmniejszamy jakość
                    while (finalBlob.size > maxSizeBytes && quality > 0.15) {
                        quality -= 0.08;
                        finalBlob = await compress();
                    }

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