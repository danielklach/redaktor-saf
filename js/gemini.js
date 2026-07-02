// Pkt 7: adres bezpiecznego proxy (Cloudflare Worker), które trzyma prawdziwy klucz Gemini
// po swojej stronie (jako sekret środowiskowy) - klucz NIE trafia do żadnego pliku strony.
// Po wdrożeniu Workera (patrz worker/worker.js) podmień poniższy placeholder na swój adres,
// np. "https://saf-jamnik-proxy.twoj-user.workers.dev"
const PROXY_URL = "https://saf-jamnik-proxy.saf-jamnik.workers.dev";

// Adres wdrożenia Google Apps Script (Web App), który odbiera anonimowe zgłoszenia usterek
// i wysyła je mailem (MailApp.sendEmail) na adres webmastera - patrz sendIssueReport niżej.
// UWAGA: jeśli kiedyś zmienisz kod tego skryptu w Apps Script, wdróż go jako NOWĄ WERSJĘ TEGO
// SAMEGO wdrożenia ("Manage deployments" -> ikona ołówka -> "New version"), a nie jako zupełnie
// nowe wdrożenie - inaczej ten adres /exec przestanie działać i trzeba by go tu podmienić.
const REPORT_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyvjUUY9QNE8T0bSVqV-_jEw6ZBPtvzEVliTneGTz_eR_Y-RhkD16pcVuuw4pEktrZFBA/exec";

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

// Tagi preferowane dla kategorii "Z życia agencji" - wewnętrzne życie i integracja zespołu,
// zamiast typowo reporterskich tagów (patrz wymóg użytkownika w getPromptTemplate).
const AGENCY_LIFE_TAGS = [
    "integracja", "kulisy", "spotkanie-agencji", "szkolenie", "warsztaty-fotograficzne",
    "sprzet-fotograficzny", "zycie-agencji", "saf-jamnik", "wspolnota"
];

export const Gemini = {
    // Dynamiczny wywiad AI na podstawie wpisanych danych - zwraca TABLICĘ pytań (JSON),
    // żeby dało się je łatwo i niezawodnie ponumerować w interfejsie (pkt 2).
    async askForMissingDetails(category, title, location, start, end, notes) {
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

        const raw = await this.callGeminiRaw(prompt, {
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

    getPromptTemplate(category, notes, link = null) {
        const isAgencyLife = category === 'zycie';

        const linkInstructions = link
            ? `Autor chce dodać do artykułu ten link: "${link.url}" (autor opisał go tak: "${link.description || 'brak opisu'}"). Na tej podstawie sam zdecyduj, jak go zaprezentować:
   - Jeśli to link do GALERII ZDJĘĆ w chmurze (np. Dysk/Zdjęcia Google, OneDrive, Dropbox, iCloud) - zaprezentuj go jako WYRÓŻNIONY PRZYCISK: wypełnij pole "linkButton" w schemacie JSON, np. {"url": "${link.url}", "label": "Zobacz pełną galerię zdjęć"} (etykietę dobierz zachęcająco do kontekstu).
   - W KAŻDYM INNYM przypadku (wydarzenie/profil na Facebooku, strona organizatora, artykuł źródłowy itp.) - NIE wypełniaj "linkButton", tylko wpleć go naturalnie w treść JEDNEGO pasującego akapitu jako zwykły odnośnik HTML: <a href="${link.url}" target="_blank" rel="noopener noreferrer">opisowy tekst linku</a>.`
            : 'Autor nie podał żadnego dodatkowego linku do artykułu - pomiń całkowicie pole "linkButton" i nie wymyślaj żadnych linków.';

        return `${AGENCY_CONTEXT}

Działasz jako doświadczony redaktor portalu uniwersyteckiego i krytyk fotograficzny SAF Jamnik. Twój styl jest dynamiczny, poprawny językowo, angażujący i profesjonalny.

ODPOWIEDZ WYŁĄCZNIE CZYSTYM, SUROWYM KODEM JSON. Nie używaj znaczników markdownu (żadnych potrójnych apostrofów), nie dodawaj żadnych wstępów ani komentarzy poza obiektem JSON.

Schemat JSON do zastosowania:
{
  "title": "Chwytliwy tytuł wpisu",
  "lead": "Lead dziennikarski (2-4 zdania)",
  "paragraphs": [
    {"type": "text", "heading": "Opcjonalny, chwytliwy śródtytuł sekcji", "text": "Treść akapitu, ok. 600 znaków"},
    {"type": "table", "heading": "Opcjonalny śródtytuł", "rows": [["Nagłówek 1", "Nagłówek 2"], ["wiersz 1 - kol. 1", "wiersz 1 - kol. 2"]]}
  ],
  "linkButton": {"url": "...", "label": "..."},
  "tags": ["tag1", "tag2"],
  "filenameSlug": "krotki-czytelny-slug"
}
Każdy element "paragraphs" MUSI mieć pole "type" równe "text" albo "table". Pole "linkButton" dodawaj TYLKO zgodnie z punktem 11 poniżej - w przeciwnym razie całkowicie pomiń to pole w odpowiedzi.

WYMAGANIA DOTYCZĄCE TREŚCI:
1. TYTUŁ - ma być chwytliwy i ciekawy, ale wyważony: nie za długi (maksymalnie ok. 70 znaków) i nie za krótki ani lakoniczny.
2. LEAD - to pierwszy akapit tekstu, którego zadaniem jest natychmiastowe przyciągnięcie uwagi i przekazanie kluczowych informacji, pełniący jednocześnie funkcję zajawki. Długość: 2-4 zdania, ok. 200-400 znaków. Musi zwięźle odpowiadać na pytania: kto, co, gdzie, kiedy, jak i dlaczego. Wpleć element, który zaintryguje odbiorcę - mocny cytat, zaskakujący fakt lub krótką anegdotę.
3. ŚRÓDTYTUŁY - dziel dłuższy tekst na logiczne sekcje z krótkimi, chwytliwymi śródtytułami (pole "heading").
4. AKAPITY - treść ma być długa i wyczerpująca. Każdy akapit typu "text" (pole "text") powinien mieć ok. 600 znaków (nie licząc śródtytułów). Używaj znaczników <strong> i <em> w treści akapitów tam, gdzie warto podkreślić ważne informacje, liczby, cytaty lub nazwy własne.
5. TAGI - w pierwszej kolejności wybieraj spośród tagów już istniejących na stronie: ${EXISTING_TAGS.join(", ")}. Własne, nowe tagi dodawaj TYLKO wtedy, gdy żaden z powyższych naprawdę nie pasuje do tematu.${isAgencyLife ? ` UWAGA - kategoria to "Z życia agencji": UNIKAJ typowo reporterskich tagów jak "reportaz" czy "olsztyn" (użyj ich TYLKO, jeśli z notatek jasno wynika, że są niezbędne). Zamiast tego dobieraj tagi pasujące do wewnętrznego życia i integracji agencji, np.: ${AGENCY_LIFE_TAGS.join(", ")}.` : ''}
6. FILENAMESLUG - wygeneruj krótki (2-5 słów), czytelny dla człowieka slug opisujący zdjęcia z tego wydarzenia: same małe litery, myślniki zamiast spacji, BEZ polskich znaków diakrytycznych. Zostanie użyty jako baza nazw plików zdjęć w formacie RRRR-MM-{filenameSlug}-NR.webp (datę i numer porządkowy dogeneruje system automatycznie). Przykłady dobrych sluggów: "kortowiada-kortostrong", "nowy-telewizor", "koncert-myslovitz-w-kortowie".
7. ŹRÓDŁA - jeśli w notatkach poniżej pojawia się sekcja oznaczona jako "ZEWNĘTRZNY ARTYKUŁ" (tekst wklejony z innego portalu, np. lokalnego serwisu informacyjnego) - potraktuj ją WYŁĄCZNIE jako pomocnicze źródło faktów: poprawne nazwiska, oficjalne nazwy tras koncertowych/wydarzeń, daty i inne szczegóły, które mogły umknąć naszym fotografom. NIE przepisuj z niej zdań ani stylu - Twój tekst ma być w pełni oryginalny. W razie sprzeczności priorytet mają notatki redakcji SAF Jamnik.
8. DATY I GODZINY - notatki poniżej mogą zawierać techniczne znaczniki czasu w formacie RRRR-MM-DDTHH:MM (np. "2026-05-07T01:09") - to surowe dane z formularza, NIE tekst do przepisania. W treści artykułu ZAWSZE zamień je na naturalny, potoczny polski zapis, taki jaki napisałby człowiek:
   - zamiast "2026-05-07" pisz np. "7 maja" (data wynika z kontekstu, nie trzeba powtarzać roku, jeśli to oczywiste),
   - zamiast "T01:09" pisz np. "1:09" albo słownie "pierwsza dziewięć",
   - zakres dwóch znaczników czasu opisuj opisowo, a nie jako dwa surowe zapisy obok siebie - np. zamiast "od 2026-05-07T01:09 do 2026-05-07T08:09" napisz "7 maja od pierwszej w nocy do ósmej rano" albo "7 maja, przez siedem godzin od 1:09" - wybierz wersję, która brzmi najbardziej naturalnie w zdaniu.
   Tekst ma brzmieć tak, jakby napisał go człowiek, a nie system komputerowy - unikaj też dosłownego wypisywania obu identycznych dat w jednym zdaniu, jeśli można to skrócić i uprościć.
9. MYŚLNIKI - gdy chcesz użyć myślnika lub półpauzy w zdaniu, ZAWSZE używaj wyłącznie zwykłego znaku "-" (dywiz). NIGDY nie używaj długiej kreski "–" ani "—" - te znaki charakterystycznie zdradzają tekst wygenerowany przez AI.
10. TABELE - jeśli jakieś dane naprawdę lepiej prezentują się w formie tabeli (np. wyniki meczów, tabela grupowa rozgrywek, zestawienie liczb czy statystyk) - użyj akapitu z "type":"table" zamiast "type":"text", z polem "rows" (tablica wierszy - każdy wiersz to tablica komórek tekstowych, PIERWSZY wiersz to nagłówki kolumn). Używaj tabel OSZCZĘDNIE i tylko w naprawdę uzasadnionych przypadkach - zdecydowana większość akapitów powinna zostać zwykłym tekstem ("type":"text").
11. LINK DODATKOWY - ${linkInstructions}

Kategoria wpisu: ${category.toUpperCase()}
Oto pełna treść notatek oraz zebranych informacji o wydarzeniu:
${notes}`;
    },

    // Surowe wywołanie API - zawsze przez bezpieczne proxy (Cloudflare Worker), które trzyma
    // klucz Gemini po swojej stronie jako sekret środowiskowy (patrz worker/worker.js).
    async callGeminiRaw(prompt, generationConfig = {}) {
        if (!PROXY_URL || PROXY_URL.includes('TWOJ-USER')) {
            throw new Error("Bezpieczne proxy z kluczem API redakcji nie jest jeszcze skonfigurowane (patrz worker/worker.js i komentarz w js/gemini.js). Skontaktuj się z administratorem strony.");
        }
        const response = await fetch(PROXY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, generationConfig })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error?.message || errData.error || response.statusText);
        }

        const data = await response.json();
        if (!data.candidates || data.candidates.length === 0) throw new Error("Brak odpowiedzi od modelu AI.");

        return data.candidates[0].content.parts[0].text.trim();
    },

    // Anonimowe zgłoszenie problemu - użytkownik NIE wysyła niczego sam (żadnego mailto:).
    // Trafia do Google Apps Script (Web App), który mailem (MailApp.sendEmail) przekazuje treść
    // na adres webmastera - żadne dane identyfikujące użytkownika nie są wysyłane.
    // CELOWO bez nagłówka "Content-Type: application/json": Apps Script nie obsługuje zapytań
    // "preflight" (OPTIONS) wywoływanych przez przeglądarkę dla JSON-a, więc żądanie musi zostać
    // "prostym" zapytaniem (text/plain) - stąd brak jawnych headers (fetch domyślnie ustawia
    // text/plain dla treści-stringa). Skrypt i tak czyta surową treść przez e.postData.contents
    // i sam parsuje ją jako JSON, więc deklarowany Content-Type nie ma dla niego znaczenia.
    async sendIssueReport(category, description) {
        const response = await fetch(REPORT_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ category, description })
        });

        if (!response.ok) {
            throw new Error(`Serwer zgłoszeń odpowiedział błędem (status ${response.status}).`);
        }

        // Skrypt ZAWSZE odpowiada HTTP 200 (nawet przy błędzie po swojej stronie - patrz blok
        // catch w kodzie Apps Script), więc o powodzeniu decyduje wyłącznie pole "status" w JSON-ie.
        const data = await response.json();
        if (data.status !== 'success') {
            throw new Error(data.message || 'Nieznany błąd Google Apps Script.');
        }
    },

    async callGemini(prompt) {
        let textResult = await this.callGeminiRaw(prompt, {
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