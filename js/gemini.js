export const Gemini = {
    async askForMissingDetails(apiKey, category, title, location, start, end, notes) {
        const prompt = `Jesteś redaktorem Studenckiej Agencji Fotograficznej (SAF) Jamnik. Zbierasz informacje do artykułu. Fotograf wrzucił notatki:
Kategoria: ${category}
Wydarzenie: ${title}
Miejsce: ${location}
Czas: ${start} - ${end}
Notatki: ${notes}

Wygeneruj od 5 do 8 krótkich, dziennikarskich pytań o szczegóły (anegdoty, emocje, braki w informacji), o których ZAPOMNIAŁ NAPISAĆ. 
WAŻNE: Zwróć wynik WYŁĄCZNIE w postaci surowej tablicy JSON zawierającej stringi (pytania). Żadnego markdownu.
Przykład: ["Jakie były emocje?", "Kto wygrał?"]`;

        const responseText = await this.callGeminiRaw(apiKey, prompt);
        
        try {
            const jsonMatch = responseText.match(/\[[\s\S]*\]/);
            if (jsonMatch) return JSON.parse(jsonMatch[0]);
            return JSON.parse(responseText);
        } catch(e) {
            throw new Error("AI nie zwróciło pytań w formacie tablicy JSON.");
        }
    },

    getPromptTemplate(category, notes) {
        return `Jesteś redaktorem na stronie aktualności Studenckiej Agencji Fotograficznej (SAF) Jamnik z uwm.edu.pl. 
Piszesz ten tekst w imieniu redakcji/agencji, na podstawie podanych notatek. Pamiętaj: autor piszący ten tekst to niekoniecznie autor zdjęć! 

WYTYCZNE DZIENNIKARSKIE:
1. Tytuł: ma być chwytliwy, fajny, nie za długi, nie za krótki.
2. Lead (zajawka): długość 2-4 zdania (200-400 znaków). Ma natychmiast przykuć uwagę i odpowiadać na pytania: kto, co, gdzie, kiedy, dlaczego. Zastosuj intrygujący element.
3. Treść (akapity): Długa i wyczerpująca. Dąż do ok. 600 znaków na każdy akapit tekstowy. Używaj w tekście pogrubień (<b> lub <strong>) dla wyróżnienia ważnych nazwisk, zwycięzców lub nazw.
4. Tagi: Użyj tych, jeśli pasują: boj-wydzialow, flanki, gry-barowe, kortowiada, kortowo, koszykowka, kultura, lekkoatletyka, liga-wydzialow, mok, mskn, muzyka-na-zywo, olsztyn, green, pilka-nozna, pilka-reczna, polandrock, reportaz, siatkowka, sport. Możesz dodać własne.

ODPOWIEDZ WYŁĄCZNIE CZYSTYM KODEM JSON! Brak markdownu, brak znaczników \`\`\`json.
Schemat JSON:
{
  "title": "Twój chwytliwy tytuł",
  "lead": "Tekst leadu...",
  "paragraphs": [
    {"heading": "Intrygujący śródtytuł (lub null)", "text": "Długi tekst akapitu (ok 600 znaków)"}
  ],
  "tags": ["tag1", "tag2"]
}

Kategoria: ${category.toUpperCase()}
Notatki z terenu do przetworzenia:
${notes}`;
    },

    async callGeminiRaw(apiKey, prompt) {
        // Używamy stabilnego v1beta i modelu 1.5-flash bez blokujących paramertów konfiguracyjnych
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error?.message || response.statusText);
        }
        
        const data = await response.json();
        if (!data.candidates || data.candidates.length === 0) throw new Error("Brak odpowiedzi od modelu AI.");
        
        return data.candidates[0].content.parts[0].text.trim();
    },

    async callGemini(apiKey, prompt) {
        let textResult = await this.callGeminiRaw(apiKey, prompt);
        const jsonMatch = textResult.match(/\{[\s\S]*\}/);
        if (jsonMatch) textResult = jsonMatch[0];
        return JSON.parse(textResult);
    }
};