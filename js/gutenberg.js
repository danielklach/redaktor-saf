export const Gutenberg = {
    generateBlockCode(aiData, processedImages) {
        let output = "";

        // 1. Tytuł (jako komentarz poglądowy, autor wkleja go do pola tytułu WP)
        output += `\n\n`;

        // 2. Lead (Akapit wyróżniony/pogrubiony)
        output += `\n`;
        output += `<p><strong>${aiData.lead}</strong></p>\n`;
        output += `\n\n`;

        let imgIndex = 0;
        const bodyParagraphs = aiData.paragraphs || [];

        // Przeplatanie akapitów i pojedynczych zdjęć
        bodyParagraphs.forEach((item) => {
            // Dodanie śródtytułu jeśli istnieje
            if (item.heading) {
                output += `\n`;
                output += `<h3>${item.heading}</h3>\n`;
                output += `\n\n`;
            }

            // Dodanie akapitu tekstu
            if (item.text) {
                output += `\n`;
                output += `<p>${item.text}</p>\n`;
                output += `\n\n`;
            }

            // Wplecenie pojedynczego zdjęcia po tym bloku tekstowym (jeśli są wolne zdjęcia)
            if (imgIndex < processedImages.length && imgIndex < 3) { // limit 3 zdjęć w treści, reszta do galerii
                const img = processedImages[imgIndex];
                output += `\n`;
                output += `<figure class="wp-block-image size-large"><img src="${img.wpPath}" alt="${aiData.title}"/></figure>\n`;
                output += `\n\n`;
                imgIndex++;
            }
        });

        // 3. Galeria końcowa dla pozostałych zdjęć
        if (imgIndex < processedImages.length) {
            output += `\n`;
            output += `<figure class="wp-block-gallery has-nested-images columns-3 font-style-normal font-weight-normal">\n`;
            
            while (imgIndex < processedImages.length) {
                const img = processedImages[imgIndex];
                output += `\n`;
                output += `<figure class="wp-block-image size-large"><img src="${img.wpPath}" alt="Galeria ${aiData.title}"/></figure>\n`;
                output += `\n`;
                imgIndex++;
            }

            output += `</figure>\n`;
            output += `\n`;
        }

        return output;
    }
};