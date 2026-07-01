export const Gutenberg = {
    generateId() {
        return Math.random().toString(36).substring(2, 10);
    },

    generateBlockCode(aiData, processedImages) {
        let output = "";

        // 1. Lead blokowany w H6
        const leadId = this.generateId();
        output += `\n`;
        output += `<h6 class="gb-text">${aiData.lead}</h6>\n`;
        output += `\n\n`;

        // 2. Filtrujemy obrazek wyróżniający (który ma końcówkę -00.webp lub flagę isFeatured = true).
        // Dzięki temu NIE pojawi się on drugi raz w treści artykułu, gdyż WordPress wstawia go samodzielnie nad leadem.
        const galleryImages = processedImages.filter(img => !img.isFeatured && !img.name.endsWith('-00.webp'));

        const bodyParagraphs = aiData.paragraphs || [];
        let imgIndex = 0;

        // Przeplatanie akapitów i pojedynczych zdjęć
        bodyParagraphs.forEach((item) => {
            if (item.heading) {
                const headingId = this.generateId();
                output += `\n`;
                output += `<h5 class="gb-text">${item.heading}</h5>\n`;
                output += `\n\n`;
            }

            if (item.text) {
                output += `\n`;
                output += `<p>${item.text}</p>\n`;
                output += `\n\n`;
            }

            if (imgIndex < galleryImages.length && imgIndex < 3) {
                const img = galleryImages[imgIndex];
                output += `\n`;
                output += `<figure class="wp-block-image size-full"><img src="${img.wpPath}" alt=""/></figure>\n`;
                output += `\n\n`;
                imgIndex++;
            }
        });

        // 3. Galeria końcowa dla pozostałych zdjęć
        if (imgIndex < galleryImages.length) {
            output += `\n`;
            output += `<figure class="wp-block-gallery has-nested-images columns-2 is-cropped">\n`;
            
            while (imgIndex < galleryImages.length) {
                const img = galleryImages[imgIndex];
                output += `\n`;
                output += `<figure class="wp-block-image size-large"><img src="${img.wpPath}" alt=""/></figure>\n`;
                output += `\n`;
                imgIndex++;
            }

            output += `</figure>\n`;
            output += `\n`;
        }

        return output;
    }
};