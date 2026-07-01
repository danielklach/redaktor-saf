export const Gutenberg = {
    generateId() {
        return Math.random().toString(36).substring(2, 10);
    },

    generateBlockCode(aiData, processedImages) {
        let output = "";

        // 1. Lead blokowany w H6 (zgodnie z przykładem wp:generateblocks/text)
        const leadId = this.generateId();
        output += `<!-- wp:generateblocks/text {"uniqueId":"${leadId}","tagName":"h6"} -->\n`;
        output += `<h6 class="gb-text">${aiData.lead}</h6>\n`;
        output += `<!-- /wp:generateblocks/text -->\n\n`;

        let imgIndex = 0;
        const bodyParagraphs = aiData.paragraphs || [];

        // Przeplatanie akapitów i pojedynczych zdjęć
        bodyParagraphs.forEach((item) => {
            // Dodanie śródtytułu jako H5
            if (item.heading) {
                const headingId = this.generateId();
                output += `<!-- wp:generateblocks/text {"uniqueId":"${headingId}","tagName":"h5"} -->\n`;
                output += `<h5 class="gb-text">${item.heading}</h5>\n`;
                output += `<!-- /wp:generateblocks/text -->\n\n`;
            }

            // Dodanie akapitu tekstu
            if (item.text) {
                output += `<!-- wp:paragraph -->\n`;
                output += `<p>${item.text}</p>\n`;
                output += `<!-- /wp:paragraph -->\n\n`;
            }

            // Wplecenie pojedynczego zdjęcia
            if (imgIndex < processedImages.length && imgIndex < 3) {
                const img = processedImages[imgIndex];
                output += `<!-- wp:image {"sizeSlug":"full","linkDestination":"none"} -->\n`;
                output += `<figure class="wp-block-image size-full"><img src="${img.wpPath}" alt=""/></figure>\n`;
                output += `<!-- /wp:image -->\n\n`;
                imgIndex++;
            }
        });

        // 3. Galeria końcowa dla pozostałych zdjęć
        if (imgIndex < processedImages.length) {
            output += `<!-- wp:gallery {"columns":2,"randomOrder":true,"linkTo":"none"} -->\n`;
            output += `<figure class="wp-block-gallery has-nested-images columns-2 is-cropped">\n`;
            
            while (imgIndex < processedImages.length) {
                const img = processedImages[imgIndex];
                output += `<!-- wp:image {"sizeSlug":"large","linkDestination":"none"} -->\n`;
                output += `<figure class="wp-block-image size-large"><img src="${img.wpPath}" alt=""/></figure>\n`;
                output += `<!-- /wp:image -->\n`;
                imgIndex++;
            }

            output += `</figure>\n`;
            output += `<!-- /wp:gallery -->\n`;
        }

        return output;
    }
};