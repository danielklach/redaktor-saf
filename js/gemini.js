// Pkt 7: adres bezpiecznego proxy (Cloudflare Worker), które trzyma prawdziwy klucz Gemini
// po swojej stronie (jako sekret środowiskowy) - klucz NIE trafia do żadnego pliku strony.
// Po wdrożeniu Workera (patrz worker/worker.js) podmień poniższy placeholder na swój adres,
// np. "https://saf-jamnik-proxy.twoj-user.workers.dev"
const PROXY_URL = "https://saf-jamnik-proxy.saf-jamnik.workers.dev";

// Pkt 3: kontekst, który uświadamia modelowi, w czym uczestniczy i jakie role tu obowiązują.
const AGENCY_CONTEXT = `KONTEKST DZIAŁANIA:
Piszesz artykuł na stronę internetową (dział "Aktualności") Studenckiej Agencji Fotograficznej "Jamnik" (SAF Jamnik), działającej przy Uniwersytecie Warmińsko-Mazurskim w Olsztynie. SAF Jamnik to zespół studentów-fotografów dokumentujących wydarzenia sportowe, kulturalne i naukowe na uczelni oraz w Olsztynie, publikujący relacje wraz z galeriami zdjęć.

WAŻNE ROZRÓŻNIENIE RÓL: osoba redagująca ten tekst (autor/redaktor) NIE musi być tą samą osobą, która robiła zdjęcia na wydarzeniu - to bardzo często dwie różne osoby. Dlatego:
- Nie zakładaj i nie pisz w pierwszej osobie liczby pojedynczej, że to Ty (autor tekstu) osobiście fotografowałeś/aś wydarzenie, chyba że notatki wprost to potwierdzają.
- Gdy piszesz o fotografowaniu, odnoś się do "naszych fotografów z SAF Jamnik" jako zespołu/agencji (wymieniając konkretne imiona i nazwiska, jeśli podano je w notatkach), a nie do siebie jako autora tekstu.
- Możesz pisać w imieniu redakcji/agencji w liczbie mnogiej ("byliśmy na miejscu", "nasza ekipa", "redakcja SAF Jamnik"), ale nie utożsamiaj automatycznie roli piszącego z rolą fotografującego.`;

// Tagi już istniejące na stronie - model ma sugerować się nimi w pierwszej kolejności (patrz wymóg użytkownika).
const EXISTING_TAGS = [
    "boj-wydzialow", "flanki", "gry-barowe", "kortowiada", "kortowo", "koszykowka",
    "kultura", "lekkoatletyka", "liga-wydzialow", "mok", "mskn", "muzyka-na-zywo",
    "olsztyn", "green", "pilka-nozna", "pilka-reczna", "polandrock", "reportaz",
    "siatkowka", "sport"
];

export const Gemini = {
    // Dynamiczny wywiad AI na podstawie wpisanych danych - zwraca TABLICĘ pytań (JSON),
    // żeby dało się je łatwo i niezawodnie ponumerować w interfejsie (pkt 2).
    async askForMissingDetails(apiKey, category, title, location, start, end, notes) {
        const prompt = `${AGENCY_CONTEXT}

Jesteś dociekliwym redaktorem naczelnym SAF Jamnik. Twój fotoreporter właśnie wrócił z wydarzenia i wrzucił do systemu takie surowe notatki:
Kategoria: ${category}
Wydarzenie: ${title}
Miejsce: ${location}
Czas: ${start} - ${end}
Notatki: ${notes}

Wygeneruj od 5 do 8 konkretnych, krótkich pytań pomocniczych, które wyciągną ciekawe szczegóły (klimat, anegdoty, brakujące fakty), o których autor notatek mógł zapomnieć. Nie pytaj o informacje, które już podał.

ODPOWIEDZ WYŁĄCZNIE CZYSTYM, SUROWYM KODEM JSON w formacie:
{"questions": ["pytanie 1", "pytanie 2"]}
Bez markdownu, bez wstępów, bez komentarzy poza obiektem JSON.`;

        const raw = await this.callGeminiRaw(apiKey, prompt, {
            temperature: 0.8,
            maxOutputTokens: 700,
            // Pkt 1: krótka lista pytań nie wymaga głębokiego "namysłu" modelu - to główne
            // przyspieszenie tego etapu. Jeśli Twoje konto/model zwróci błąd walidacji przez
            // to pole, po prostu usuń całą linię "thinkingConfig".
            thinkingConfig: { thinkingBudget: 0 }
        });

        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? jsonMatch[0] : raw;
        const parsed = JSON.parse(jsonStr);
        return Array.isArray(parsed.questions) ? parsed.questions : [];
    },

    getPromptTemplate(category, notes) {
        return `${AGENCY_CONTEXT}

Działasz jako doświadczony redaktor portalu uniwersyteckiego i krytyk fotograficzny SAF Jamnik. Twój styl jest dynamiczny, poprawny językowo, angażujący i profesjonalny.

ODPOWIEDZ WYŁĄCZNIE CZYSTYM, SUROWYM KODEM JSON. Nie używaj znaczników markdownu (żadnych potrójnych apostrofów), nie dodawaj żadnych wstępów ani komentarzy poza obiektem JSON.

Schemat JSON do zastosowania:
{
  "title": "Chwytliwy tytuł wpisu",
  "lead": "Lead dziennikarski (2-4 zdania)",
  "paragraphs": [
    {"heading": "Opcjonalny, chwytliwy śródtytuł sekcji", "text": "Treść akapitu, ok. 600 znaków"}
  ],
  "tags": ["tag1", "tag2"]
}

WYMAGANIA DOTYCZĄCE TREŚCI:
1. TYTUŁ - ma być chwytliwy i ciekawy, ale wyważony: nie za długi (maksymalnie ok. 70 znaków) i nie za krótki ani lakoniczny.
2. LEAD - to pierwszy akapit tekstu, którego zadaniem jest natychmiastowe przyciągnięcie uwagi i przekazanie kluczowych informacji, pełniący jednocześnie funkcję zajawki. Długość: 2-4 zdania, ok. 200-400 znaków. Musi zwięźle odpowiadać na pytania: kto, co, gdzie, kiedy, jak i dlaczego. Wpleć element, który zaintryguje odbiorcę - mocny cytat, zaskakujący fakt lub krótką anegdotę.
3. ŚRÓDTYTUŁY - dziel dłuższy tekst na logiczne sekcje z krótkimi, chwytliwymi śródtytułami (pole "heading").
4. AKAPITY - treść ma być długa i wyczerpująca. Każdy akapit ("text") powinien mieć ok. 600 znaków (nie licząc śródtytułów). Używaj znaczników <strong> i <em> w treści akapitów tam, gdzie warto podkreślić ważne informacje, liczby, cytaty lub nazwy własne.
5. TAGI - w pierwszej kolejności wybieraj spośród tagów już istniejących na stronie: ${EXISTING_TAGS.join(", ")}. Własne, nowe tagi dodawaj TYLKO wtedy, gdy żaden z powyższych naprawdę nie pasuje do tematu.

Kategoria wpisu: ${category.toUpperCase()}
Oto pełna treść notatek oraz zebranych informacji o wydarzeniu:
${notes}`;
    },

    // Surowe wywołanie API. Jeśli podano własny (osobisty) klucz - wołamy Gemini bezpośrednio.
    // Jeśli klucz jest pusty - korzystamy z bezpiecznego proxy, które zna klucz redakcji (pkt 7).
    async callGeminiRaw(apiKey, prompt, generationConfig = {}) {
        let response;

        if (apiKey) {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;
            response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig
                })
            });
        } else {
            if (!PROXY_URL || PROXY_URL.includes('TWOJ-USER')) {
                throw new Error("Bezpieczne proxy z kluczem API redakcji nie jest jeszcze skonfigurowane (patrz worker/worker.js i komentarz w js/gemini.js). Wklej tymczasowo własny klucz Gemini API w prawym górnym rogu.");
            }
            response = await fetch(PROXY_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, generationConfig })
            });
        }

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error?.message || errData.error || response.statusText);
        }

        const data = await response.json();
        if (!data.candidates || data.candidates.length === 0) throw new Error("Brak odpowiedzi od modelu AI.");

        return data.candidates[0].content.parts[0].text.trim();
    },

    async callGemini(apiKey, prompt) {
        let textResult = await this.callGeminiRaw(apiKey, prompt, {
            temperature: 0.85,
            // Pełniejszy "namysł" modelu dla długiego, wyczerpującego artykułu = lepsza jakość.
            // Jeśli Twoje konto/model zwróci błąd walidacji przez to pole, usuń całą linię.
            thinkingConfig: { thinkingBudget: 1024 }
        });

        // Zabezpieczenie: sztuczna inteligencja zawsze musi zwrócić parsowalny JSON
        const jsonMatch = textResult.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            textResult = jsonMatch[0];
        }

        return JSON.parse(textResult);
    }
};