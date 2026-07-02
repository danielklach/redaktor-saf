export const Gutenberg = {
    // Generuje losowy 8-znakowy identyfikator hex, tak jak w przykładowych blokach WP (np. "e002b2ba")
    randomId() {
        return Array.from({ length: 8 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    },

    generateBlockCode(aiData, processedImages) {
        let output = "";
        // Obrazek oznaczony jako wyróżniający (nazwa kończąca się na "-00") jest ustawiany
        // ręcznie jako Featured Image w WordPressie i wyświetla się tam automatycznie nad
        // leadem - dlatego MUSI zostać wykluczony z treści i z końcowej galerii, żeby się nie powtórzył.
        const images = processedImages.filter(img => !img.isFeatured);
        let imgIndex = 0;

        // 1. LEAD jako blok generateblocks/text z tagName "h6" (zgodnie z przykładem)
        output += `<!-- wp:generateblocks/text {"uniqueId":"${this.randomId()}","tagName":"h6"} -->\n`;
        output += `<h6 class="gb-text">${aiData.lead || ''}</h6>\n`;
        output += `<!-- /wp:generateblocks/text -->\n\n`;

        const bodyParagraphs = aiData.paragraphs || [];
        const totalParas = bodyParagraphs.length;

        // Rozkładamy zdjęcia RÓWNOMIERNIE między akapitami (nigdy stłoczone na początku), a nie
        // dosłownie po każdym z nich - najwyżej połowa akapitów (max 4) dostaje zdjęcie od razu.
        // Reszta, jeśli zostanie, trafia do galerii na końcu wpisu. Zdjęcie zawsze ląduje PO całym
        // akapicie (nagłówek + tekst), nigdy między śródtytułem a jego treścią.
        const maxInterleave = totalParas === 0 ? 0 : Math.min(images.length, Math.max(1, Math.ceil(totalParas / 2)), 4);
        const interleaveAfterPara = new Set();
        for (let i = 0; i < maxInterleave; i++) {
            const pos = Math.min(totalParas - 1, Math.floor(((i + 1) * totalParas) / (maxInterleave + 1)));
            interleaveAfterPara.add(pos);
        }

        bodyParagraphs.forEach((item, paraIdx) => {
            // Śródtytuł jako blok generateblocks/text z tagName "h5"
            if (item.heading) {
                output += `<!-- wp:generateblocks/text {"uniqueId":"${this.randomId()}","tagName":"h5"} -->\n`;
                output += `<h5 class="gb-text">${item.heading}</h5>\n`;
                output += `<!-- /wp:generateblocks/text -->\n\n`;
            }

            // Tabela (np. wyniki meczów, tabela grupowa) jako standardowy blok wp:table - AI ma
            // z niej korzystać oszczędnie, tylko gdy naprawdę porządkuje dane (patrz gemini.js).
            if (item.type === 'table' && Array.isArray(item.rows) && item.rows.length) {
                output += this.renderTableBlock(item.rows);
            } else if (item.text) {
                // Zwykły akapit jako standardowy blok wp:paragraph
                output += `<!-- wp:paragraph -->\n`;
                output += `<p>${item.text}</p>\n`;
                output += `<!-- /wp:paragraph -->\n\n`;
            }

            if (interleaveAfterPara.has(paraIdx) && imgIndex < images.length) {
                const img = images[imgIndex];
                output += `<!-- wp:image {"sizeSlug":"full","linkDestination":"none"} -->\n`;
                output += `<figure class="wp-block-image size-full"><img src="${img.wpPath}" alt=""/></figure>\n`;
                output += `<!-- /wp:image -->\n\n`;
                imgIndex++;
            }
        });

        // Przyciski-linki (np. do zewnętrznych galerii zdjęć w chmurze - patrz gemini.js, pkt 11).
        // Owinięte w wp:html, bo ".retro-link-btn" to niestandardowa klasa CSS motywu strony, a nie
        // natywny blok Gutenberga - umieszczone na końcu treści, tuż przed końcową galerią zdjęć.
        (aiData.linkButtons || []).forEach((btn) => {
            if (!btn || !btn.url) return;
            output += `<!-- wp:html -->\n`;
            output += `<a href="${btn.url}" target="_blank" rel="noopener noreferrer" class="retro-link-btn">${btn.label || 'Zobacz więcej'}</a>\n`;
            output += `<!-- /wp:html -->\n\n`;
        });

        // 2. Galeria końcowa dla pozostałych zdjęć (identyczna konstrukcja jak w przykładzie)
        if (imgIndex < images.length) {
            output += `<!-- wp:gallery {"columns":2,"randomOrder":true,"linkTo":"none"} -->\n`;
            output += `<figure class="wp-block-gallery has-nested-images columns-2 is-cropped">`;

            while (imgIndex < images.length) {
                const img = images[imgIndex];
                output += `<!-- wp:image {"sizeSlug":"large","linkDestination":"none"} -->\n`;
                output += `<figure class="wp-block-image size-large"><img src="${img.wpPath}" alt=""/></figure>\n`;
                output += `<!-- /wp:image -->\n\n`;
                imgIndex++;
            }

            output += `</figure>\n`;
            output += `<!-- /wp:gallery -->\n`;
        }

        return output.trim();
    },

    // Renderuje wiersze tabeli (pierwszy = nagłówek) jako standardowy blok wp:table.
    renderTableBlock(rows) {
        const [header, ...body] = rows;
        let html = `<!-- wp:table -->\n<figure class="wp-block-table"><table><thead><tr>`;
        html += header.map(cell => `<th>${cell}</th>`).join('');
        html += `</tr></thead><tbody>`;
        body.forEach(row => {
            html += `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`;
        });
        html += `</tbody></table></figure>\n<!-- /wp:table -->\n\n`;
        return html;
    }
};