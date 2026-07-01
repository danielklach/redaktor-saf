export const Gemini = {
    getPromptTemplate(category, notes) {
        return `Działasz jako doświadczony redaktor portalu uniwersyteckiego i krytyk fotograficzny SAF Jamnik. Twój styl jest dynamiczny, poprawny językowo, angażujący i profesjonalny. 

TWOJA ODPOWIEDŹ MUSI BYĆ WYŁĄCZNIE CZYSTYM DOKUMENTEM JSON. Nie używaj znaczników markdownu typu \`\`\`json \`\`\`, nie dodawaj żadnych wstępów ani podsumowań. Zwróć surowy tekst gotowy do parsowania.

Schemat struktury JSON, który musisz bezwzględnie zastosować:
{
  "title": "Tytuł wpisu",
  "lead": "Wprowadzający, krótki, pogrubiony lead",
  "paragraphs": [
    {"heading": "Opcjonalny nagłówek sekcji", "text": "Treść akapitu tekstowego"}
  ],
  "tags": ["tag1", "tag2"]
}

Kategoria wpisu: ${category.toUpperCase()}
Oto pełna treść notatek oraz zebranych informacji o wydarzeniu, na których MUSISZ się oprzeć przy pisaniu artykułu:
${notes}`;
    },

    getInterviewQuestion(category, title) {
        const questions = {
            kultura: `Jaki zespół wywołał największy szał pod sceną, jak radziliście sobie z trudnym oświetleniem i jaki utwór był kulminacją wieczoru?`,
            nauka: `Kto był głównym prelegentem, jaka tematyka wzbudziła największe zainteresowanie i czy pojawiły się jakieś wyjątkowe pokazy?`,
            sport: `Jaki był ostateczny wynik, która akcja zdecydowała o zwycięstwie i jakie emocje towarzyszyły kibicom na trybunach?`,
            zapowiedzi: `Czy wstęp na wydarzenie jest wolny/biletowany, dla kogo jest ono przeznaczone i jakie unikalne atrakcje zaplanowano dla uczestników?`,
            zycie: `Kto brał udział w akcji z ramienia agencji, jaki nietypowy sprzęt testowaliście i czego nowego się nauczyliście podczas tych działań?`
        };
        return questions[category] || `Czy chcesz dodać jakieś kluczowe szczegóły dotyczące tego wydarzenia?`;
    },

    async callGemini(apiKey, prompt) {
        const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;
        
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
        
        let textResult = data.candidates[0].content.parts[0].text.trim();
        
        // Zabezpieczenie przed niesfornym formatowaniem markdownu przez model
        if (textResult.includes("```")) {
            textResult = textResult.replace(/```json/gi, "").replace(/```/g, "").trim();
        }
        
        return JSON.parse(textResult);
    }
};