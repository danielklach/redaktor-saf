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
                img.onload = () => {
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

                    canvas.toBlob((blob) => {
                        if (!blob) return reject(new Error("Błąd zapisu canvas"));
                        
                        const dateObj = new Date(eventDateStr || Date.now());
                        const year = dateObj.getFullYear();
                        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                        const safeTitle = Compressor.sanitizeString(eventTitle || 'wydarzenie');
                        
                        const numStr = String(targetIndex + 1).padStart(2, '0');
                        const fileName = `${year}-${month}-${safeTitle}-${numStr}.webp`;

                        resolve({
                            blob: blob,
                            name: fileName,
                            size: blob.size,
                            previewUrl: event.target.result,
                            wpPath: `/wp-content/uploads/${year}/${month}/${fileName}`
                        });
                    }, 'image/webp', 0.73);
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
        const zipName = `${year}-${month}-${safeTitle}.zip`;

        const content = await zip.generateAsync({ type: "blob" });
        const url = window.URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = zipName;
        a.click();
    }
};