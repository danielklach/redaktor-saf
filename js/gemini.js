export const Gemini = {
    // Nowa funkcja: Dynamiczny wywiad AI na podstawie wpisanych danych
    async askForMissingDetails(apiKey, category, title, location, start, end, notes) {
        const prompt = `Jesteś dociekliwym redaktorem naczelnym SAF Jamnik. Twój fotograf właśnie wrócił z wydarzenia i wrzucił Ci do systemu takie surowe notatki:
Kategoria: ${category}
Wydarzenie: ${title}
Miejsce: ${location}
Czas: ${start} - ${end}
Notatki fotografa: ${notes}

Twoim zadaniem jest pomóc mu napisać z tego świetny artykuł. Wygeneruj od 5 do 10 konkretnych, krótkich pytań pomocniczych (w formie wypunktowanej listy), które wyciągną od niego ciekawe szczegóły (klimat, anegdoty, braki w informacjach), o których ZAPOMNIAŁ NAPISAĆ. Nie pytaj o to, co już podał!
Zwróć TYLKO i wyłącznie listę pytań, bez powitań, bez wstępów.`;

        return await this.callGeminiRaw(apiKey, prompt);
    },

    getPromptTemplate(category, notes) {
        return `Działasz jako doświadczony redaktor portalu uniwersyteckiego i krytyk fotograficzny SAF Jamnik. Twój styl jest dynamiczny, poprawny językowo, angażujący i profesjonalny. 

ODPOWIEDZ WYŁĄCZNIE CZYSTYM, SUROWYM KODEM JSON. Nie używaj znaczników markdownu, nie dodawaj żadnych wstępów.

Schemat JSON do zastosowania:
{
  "title": "Tytuł wpisu",
  "lead": "Wprowadzający, krótki, pogrubiony lead",
  "paragraphs": [
    {"heading": "Opcjonalny nagłówek sekcji", "text": "Treść akapitu tekstowego"}
  ],
  "tags": ["tag1", "tag2"]
}

Kategoria wpisu: ${category.toUpperCase()}
Oto pełna treść notatek oraz zebranych informacji o wydarzeniu:
${notes}`;
    },

    // Surowe wywołanie API (najbardziej stabilna wersja)
    async callGeminiRaw(apiKey, prompt) {
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
        
        // Zabezpieczenie: sztuczna inteligencja zawsze musi zwrócić parsowalny JSON
        const jsonMatch = textResult.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            textResult = jsonMatch[0];
        }
        
        return JSON.parse(textResult);
    }
};