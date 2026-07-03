// Pkt 7: adres bezpiecznego proxy (Cloudflare Worker), które trzyma prawdziwy klucz Gemini
// po swojej stronie (jako sekret środowiskowy) - klucz NIE trafia do żadnego pliku strony.
// MUSI się IDEALNIE zgadzać z polem "name" w wrangler.jsonc (worker "redaktor-saf" wystawiony
// jest pod adresem https://<name>.<subdomena-konta>.workers.dev) - jeśli kiedyś zmienisz "name"
// w wrangler.jsonc, podmień też ten adres, inaczej front-end będzie strzelał w nieistniejący Worker.
const PROXY_URL = "https://redaktor-saf.saf-jamnik.workers.dev";

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
    // "options" ({onRetry, signal}) jest tu wyłącznie przekazywane dalej do callGeminiRaw -
    // patrz tam pełen opis mechanizmu ponawiania prób i przerywania żądania.
    async askForMissingDetails(category, title, location, start, end, notes, options = {}) {
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
        }, options);

        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? jsonMatch[0] : raw;
        const parsed = JSON.parse(jsonStr);
        return Array.isArray(parsed.questions) ? parsed.questions : [];
    },

    getPromptTemplate(category, notes, links = []) {
        const isAgencyLife = category === 'zycie';

        const validLinks = (links || []).filter(l => l && l.url);
        const linkInstructions = validLinks.length
            ? validLinks.map((link, i) => `   Link ${i + 1}: "${link.url}" (autor opisał go tak: "${link.description || 'brak opisu'}"). Na tej podstawie sam zdecyduj, jak go zaprezentować:
      - Jeśli to link do GALERII ZDJĘĆ w chmurze (np. Dysk/Zdjęcia Google, OneDrive, Dropbox, iCloud) - zaprezentuj go jako WYRÓŻNIONY PRZYCISK: dopisz obiekt {"url": "${link.url}", "label": "Zobacz pełną galerię zdjęć"} do tablicy "linkButtons" w schemacie JSON (etykietę dobierz zachęcająco do kontekstu).
      - W KAŻDYM INNYM przypadku (wydarzenie/profil na Facebooku, strona organizatora, artykuł źródłowy itp.) - NIE dodawaj go do "linkButtons", tylko wpleć go naturalnie w treść JEDNEGO pasującego akapitu jako zwykły odnośnik HTML: <a href="${link.url}" target="_blank" rel="noopener noreferrer">opisowy tekst linku</a>.`).join('\n')
            : 'Autor nie podał żadnych dodatkowych linków do artykułu - pole "linkButtons" zostaw jako pustą tablicę [] i nie wymyślaj żadnych linków.';

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
  "linkButtons": [{"url": "...", "label": "..."}],
  "tags": ["tag1", "tag2"],
  "filenameSlug": "krotki-czytelny-slug"
}
Każdy element "paragraphs" MUSI mieć pole "type" równe "text" albo "table". Tablica "linkButtons" MUSI być obecna (choćby pusta []) - dodawaj do niej wpisy TYLKO zgodnie z punktem 11 poniżej.

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
11. LINKI DODATKOWE - ${validLinks.length ? `autor podał ${validLinks.length > 1 ? 'kilka linków' : 'link'} do potencjalnego dodania:\n` + linkInstructions : linkInstructions}

Kategoria wpisu: ${category.toUpperCase()}
Oto pełna treść notatek oraz zebranych informacji o wydarzeniu:
${notes}`;
    },

    // Tryb pół-automatyczny: autor pisze artykuł CAŁKOWICIE sam, AI dostaje już POSTRUKTURYZOWANE
    // lead+akapity (patrz app.js -> parseArticleText) i wolno mu WYŁĄCZNIE poprawić literówki oraz
    // dodać <strong>/<em> tam, gdzie warto - żadnych zmian treści, sensu, kolejności czy długości.
    // Publiczna (nie tylko wewnętrzna) metoda, żeby dało się zbudować DOKŁADNIE ten sam prompt do
    // ręcznego skopiowania w app.js -> buildExternalPromptText (patrz tam), niezależnie od tego,
    // czy wywołanie AI w ogóle się odbyło.
    polishPromptTemplate({ lead, paragraphs }) {
        const textParagraphs = (paragraphs || []).filter(p => p.type !== 'table');
        const numbered = textParagraphs
            .map((p, i) => `[AKAPIT ${i}]${p.heading ? ` (śródtytuł: "${p.heading}")` : ''}\n${p.text}`)
            .join('\n\n');

        return `${AGENCY_CONTEXT}

Otrzymujesz GOTOWY, w całości napisany przez człowieka artykuł dla portalu SAF Jamnik. Twoim JEDYNYM zadaniem jest:
1. Poprawić literówki oraz oczywiste błędy interpunkcyjne i ortograficzne.
2. Dodać znaczniki <strong> i <em> tam, gdzie faktycznie warto podkreślić ważną informację, liczbę, cytat lub nazwę własną.
3. NIC WIĘCEJ. Zabronione jest: zmienianie znaczenia zdań, dodawanie nowych zdań, usuwanie zdań, przestawianie kolejności, zmiana faktów, "ulepszanie" stylu ponad to, co napisał autor. Tekst MA pozostać w 99% dosłownie tym, co napisał autor - Twoja ingerencja ma być NIEZAUWAŻALNA poza poprawkami literówek i pogrubieniami.
4. Myślniki: jeśli musisz cokolwiek dopisać/poprawić w tym zakresie, używaj WYŁĄCZNIE zwykłego znaku "-", nigdy "–" ani "—".

LEAD:
${lead}

AKAPITY (każdy oznaczony numerem w nawiasach kwadratowych - MUSISZ zwrócić DOKŁADNIE tyle samo akapitów, w tej samej kolejności):
${numbered || '(brak akapitów tekstowych - w artykule są tylko tabele/przyciski, które i tak zostają bez zmian)'}

ODPOWIEDZ WYŁĄCZNIE CZYSTYM, SUROWYM KODEM JSON w formacie:
{"lead": "poprawiony lead", "paragraphs": ["poprawiony akapit 0", "poprawiony akapit 1"]}
Tablica "paragraphs" MUSI mieć DOKŁADNIE ${textParagraphs.length} elementów, w tej samej kolejności co powyżej. Bez markdownu, bez wstępów, bez komentarzy poza obiektem JSON.`;
    },

    // Wykonuje faktyczne wywołanie AI dla powyższego promptu i scala poprawiony tekst z powrotem
    // w oryginalny kształt {lead, paragraphs} - akapity typu "table" przechodzą 1:1 (nie mają
    // prozy do poprawiania, więc w ogóle nie idą do AI - patrz polishPromptTemplate).
    async polishArticleText({ lead, paragraphs }, options = {}) {
        const safeParagraphs = paragraphs || [];
        const textIndices = [];
        safeParagraphs.forEach((p, i) => { if (p.type !== 'table') textIndices.push(i); });

        if (textIndices.length === 0 && !(lead || '').trim()) {
            return { lead, paragraphs: safeParagraphs }; // nic do poprawienia (np. sama tabela)
        }

        const prompt = this.polishPromptTemplate({ lead, paragraphs: safeParagraphs });
        const raw = await this.callGeminiRaw(prompt, {
            temperature: 0.3, // nisko - to korekta, nie kreatywne pisanie
            thinkingConfig: { thinkingBudget: 512 }
        }, options);

        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
        const polishedTexts = Array.isArray(parsed.paragraphs) ? parsed.paragraphs : [];

        const resultParagraphs = safeParagraphs.map((p, i) => {
            if (p.type === 'table') return p;
            const idx = textIndices.indexOf(i);
            return { ...p, text: polishedTexts[idx] ?? p.text };
        });

        return { lead: parsed.lead || lead, paragraphs: resultParagraphs };
    },

    // Krótkie, szybkie sugestie tytułu/tagów na podstawie już napisanej treści (tryb pół-automatyczny,
    // przyciski "AI zasugeruj") - te same niskokosztowe ustawienia co askForMissingDetails.
    async suggestTitle(articleText, options = {}) {
        const prompt = `${AGENCY_CONTEXT}

Poniżej znajduje się treść artykułu napisanego przez redaktora SAF Jamnik. Zaproponuj JEDEN chwytliwy, ale wyważony tytuł (nie za długi - maks. ok. 70 znaków, nie za krótki ani lakoniczny) pasujący do tej treści.

Treść artykułu:
${articleText}

ODPOWIEDZ WYŁĄCZNIE CZYSTYM, SUROWYM KODEM JSON w formacie:
{"title": "Proponowany tytuł"}
Bez markdownu, bez wstępów, bez komentarzy poza obiektem JSON.`;

        const raw = await this.callGeminiRaw(prompt, {
            temperature: 0.8, maxOutputTokens: 200, thinkingConfig: { thinkingBudget: 0 }
        }, options);

        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
        return parsed.title || '';
    },

    async suggestTags(category, articleText, options = {}) {
        const isAgencyLife = category === 'zycie';
        const prompt = `${AGENCY_CONTEXT}

Poniżej znajduje się treść artykułu napisanego przez redaktora SAF Jamnik (kategoria: ${category.toUpperCase()}). Zaproponuj od 2 do 5 pasujących tagów.

W pierwszej kolejności wybieraj spośród tagów już istniejących na stronie: ${EXISTING_TAGS.join(", ")}. Własne, nowe tagi dodawaj TYLKO wtedy, gdy żaden z powyższych naprawdę nie pasuje.${isAgencyLife ? ` UWAGA - kategoria to "Z życia agencji": UNIKAJ typowo reporterskich tagów jak "reportaz" czy "olsztyn". Zamiast tego dobieraj tagi pasujące do wewnętrznego życia i integracji agencji, np.: ${AGENCY_LIFE_TAGS.join(", ")}.` : ''}

Treść artykułu:
${articleText}

ODPOWIEDZ WYŁĄCZNIE CZYSTYM, SUROWYM KODEM JSON w formacie:
{"tags": ["tag1", "tag2"]}
Bez markdownu, bez wstępów, bez komentarzy poza obiektem JSON.`;

        const raw = await this.callGeminiRaw(prompt, {
            temperature: 0.7, maxOutputTokens: 200, thinkingConfig: { thinkingBudget: 0 }
        }, options);

        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
        return Array.isArray(parsed.tags) ? parsed.tags : [];
    },

    // Rozpoznaje błędy PRZECIĄŻENIA serwerów Google (zbyt duży ruch, "high demand") - odróżniamy
    // je celowo od innych błędów (zły klucz, brak promptu, nieznany model), bo TYLKO przeciążenie
    // ma sens ponawiać automatycznie - każdy inny błąd i tak powtórzyłby się identycznie,
    // więc ponawianie tylko zwiększyłoby koszt zapytań bez szans na sukces.
    isOverloadError(status, message) {
        return status === 429 || status === 503 || /high demand|overloaded|resource.*exhausted|unavailable/i.test(message || '');
    },

    // Odczekuje "ms" milisekund, z możliwością przerwania przez AbortSignal (np. użytkownik
    // kliknął "Pomiń" w trakcie odliczania do kolejnej próby - patrz callGeminiRaw).
    delay(ms, signal) {
        return new Promise((resolve, reject) => {
            if (signal?.aborted) {
                reject(this._abortError());
                return;
            }
            let onAbort;
            const timer = setTimeout(() => {
                signal?.removeEventListener('abort', onAbort);
                resolve();
            }, ms);
            onAbort = () => {
                clearTimeout(timer);
                reject(this._abortError());
            };
            signal?.addEventListener('abort', onAbort, { once: true });
        });
    },

    _abortError() {
        return new DOMException('Przerwano przez użytkownika.', 'AbortError');
    },

    // Surowe wywołanie API - zawsze przez bezpieczne proxy (Cloudflare Worker), które trzyma
    // klucz Gemini po swojej stronie jako sekret środowiskowy (patrz worker/worker.js).
    //
    // Mechanizm ponawiania prób przy przeciążeniu ("high demand"/429/503) - optymalizacja kosztów:
    // - Próby 1-3: zawsze na najtańszym, DOMYŚLNYM modelu (patrz GEMINI_MODELS w worker.js),
    //   w odstępach 3 sekund - to pokrywa zdecydowaną większość chwilowych przeciążeń.
    // - Próba 4 (OSTATECZNA): jeśli domyślny model nadal jest przeciążony po 3 próbach, Worker
    //   dostaje flagę "useOverloadFallback" i sam, jednorazowo, przełącza się na alternatywny,
    //   stabilniejszy model (wciąż z tańszej rodziny Flash, NIGDY Pro - patrz worker.js).
    // Każdy inny błąd (zły klucz, brak promptu itp.) jest rzucany OD RAZU, bez ponawiania.
    //
    // "options.onRetry(nextAttempt, maxDefaultAttempts, isFallbackAttempt)" pozwala UI pokazać
    // komunikat o ponawianiu (patrz app.js), a "options.signal" (AbortSignal) pozwala użytkownikowi
    // przerwać oczekiwanie/żądanie w dowolnym momencie (np. przyciskiem "Pomiń").
    async callGeminiRaw(prompt, generationConfig = {}, { onRetry, signal } = {}) {
        if (!PROXY_URL || PROXY_URL.includes('TWOJ-USER')) {
            throw new Error("Bezpieczne proxy z kluczem API redakcji nie jest jeszcze skonfigurowane (patrz worker/worker.js i komentarz w js/gemini.js). Skontaktuj się z administratorem strony.");
        }

        const MAX_DEFAULT_ATTEMPTS = 3;
        const TOTAL_ATTEMPTS = MAX_DEFAULT_ATTEMPTS + 1; // + 1 ostateczna próba z modelem zapasowym
        const RETRY_DELAY_MS = 3000;

        for (let attempt = 1; attempt <= TOTAL_ATTEMPTS; attempt++) {
            const isFallbackAttempt = attempt > MAX_DEFAULT_ATTEMPTS;

            const response = await fetch(PROXY_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, generationConfig, useOverloadFallback: isFallbackAttempt }),
                signal
            });

            if (response.ok) {
                const data = await response.json();
                if (!data.candidates || data.candidates.length === 0) throw new Error("Brak odpowiedzi od modelu AI.");
                return data.candidates[0].content.parts[0].text.trim();
            }

            const errData = await response.json().catch(() => ({}));
            const message = errData.error?.message || errData.error || response.statusText;
            const hasMoreAttempts = attempt < TOTAL_ATTEMPTS;

            if (this.isOverloadError(response.status, message) && hasMoreAttempts) {
                const nextAttempt = attempt + 1;
                onRetry?.(nextAttempt, MAX_DEFAULT_ATTEMPTS, nextAttempt > MAX_DEFAULT_ATTEMPTS);
                await this.delay(RETRY_DELAY_MS, signal);
                continue;
            }

            throw new Error(message);
        }
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

    async callGemini(prompt, options = {}) {
        let textResult = await this.callGeminiRaw(prompt, {
            temperature: 0.85,
            // Pełniejszy "namysł" modelu dla długiego, wyczerpującego artykułu = lepsza jakość.
            // Jeśli Twoje konto/model zwróci błąd walidacji przez to pole, usuń całą linię.
            thinkingConfig: { thinkingBudget: 1024 }
        }, options);

        // Zabezpieczenie: sztuczna inteligencja zawsze musi zwrócić parsowalny JSON
        const jsonMatch = textResult.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            textResult = jsonMatch[0];
        }

        return JSON.parse(textResult);
    }
};