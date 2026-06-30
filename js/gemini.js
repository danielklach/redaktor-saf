export const Gemini = {
    getPromptTemplate(category, notes, details = "") {
        const base = `Działasz jako doświadczony redaktor portalu uniwersyteckiego i krytyk fotograficzny SAF Jamnik. Twój styl jest dynamiczny, poprawny językowo, angażujący i profesjonalny. Odpowiedź MUSI być czystym dokumentem JSON, ściśle według poniższego schematu (bez markdownu \`\`\`json i bez wstępów):\n{\n  "title": "Tytuł wpisu",\n  "lead": "Wprowadzający, pogrubiony lead",\n  "paragraphs": [\n    {"heading": "Opcjonalny nagłówek sekcji", "text": "Treść akapitu"}\n  ],\n  "tags": ["tag1", "tag2"]\n}\n\nNotatki autora: ${notes}\nDodatkowe szczegóły z wywiadu: ${details}\n\n`;

        const prompts = {
            kultura: base + `Kategoria: Kultura/Koncerty. Skup się na energii wykonawców, reakcji publiki, klimacie oświetlenia scenicznego i emocjach uchwyconych w kadrze.`,
            sport: base + `Kategoria: Sport. Skup się na dynamice akcji, rywalizacji, dramaturgii momentu i zamrożeniu ruchu na zdjęciach agencji.`,
            zapowiedzi: base + `Kategoria: Zapowiedzi. Tekst musi mieć charakter informacyjny, zapraszający, z jasną strukturą i wezwaniem do akcji (kiedy, gdzie, dlaczego warto być).`,
            zycie: base + `Kategoria: Z życia agencji. Ton bardziej wewnętrzny, integracyjny, pokazujący pasję, kulisy pracy fotografów, sprzęt i atmosferę wewnątrz teamu.`
        };

        return prompts[category] || prompts.kultura;
    },

    getInterviewQuestion(category, title) {
        const questions = {
            kultura: `Jaki zespół wywołał największy szał pod sceną, jak radziliście sobie z trudnym oświetleniem i jaki utwór był kulminacją wieczoru?`,
            sport: `Jaki był ostateczny wynik, która akcja zdecydowała o zwycięstwie i jakie emocje towarzyszyły kibicom na trybunach?`,
            zapowiedzi: `Czy wstęp na wydarzenie jest wolny/biletowany, dla kogo jest ono przeznaczone i jakie unikalne atrakcje zaplanowano dla uczestników?`,
            zycie: `Kto brał udział w akcji z ramienia agencji, jaki nietypowy sprzęt testowaliście i czego nowego się nauczyliście podczas tych działań?`
        };
        return questions[category] || `Czy chcesz dodać jakieś kluczowe szczegóły dotyczące tego wydarzenia?`;
    },

    async callGemini(apiKey, prompt) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json" }
            })
        });

        if (!response.ok) throw new Error(`Błąd API: ${response.statusText}`);
        const data = await response.json();
        
        let textResult = data.candidates[0].content.parts[0].text;
        return JSON.parse(textResult);
    }
};