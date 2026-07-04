/**
 * Redaktor Social Media - baza fotografów i jednostek (v1.13.0)
 *
 * Skrypt PRZYPISANY DO tego Google Dokumentu (kontenerowy Apps Script), który służy jako prosta,
 * współdzielona baza danych "kto to jest -> jaka jest jego nazwa na Instagramie". Dokument przechowuje
 * DWIE tabele (natywne tabele Google Docs, żeby admin mógł je wygodnie przeglądać/poprawiać wprost
 * w dokumencie): jedną pod nagłówkiem "Fotografowie", drugą pod nagłówkiem "Jednostki". Obie tabele
 * TWORZĄ SIĘ SAME przy pierwszym użyciu (ensureTable) - nie trzeba niczego ręcznie przygotowywać
 * poza wdrożeniem tego skryptu.
 *
 * JAK WDROŻYĆ:
 * 1. Otwórz dokument -> Rozszerzenia -> Apps Script.
 * 2. Wklej CAŁĄ zawartość tego pliku (nadpisz domyślny "Code.gs").
 * 3. Zapisz projekt (dowolna nazwa, np. "Redaktor Social Media - baza").
 * 4. Wdróż -> Nowe wdrożenie -> typ: "Aplikacja internetowa".
 *    - Wykonaj jako: "Ja" (Twoje konto - skrypt MUSI mieć dostęp do dokumentu niezależnie od tego,
 *      kto faktycznie woła endpoint z przeglądarki).
 *    - Kto ma dostęp: "Każdy" (Anyone) - inaczej wywołania z aplikacji zostaną odrzucone.
 * 5. Autoryzuj uprawnienia (pierwsze wdrożenie zapyta o zgodę na dostęp do tego dokumentu).
 * 6. Skopiuj adres kończący się na "/exec" i przekaż go administratorowi kodu (Claude) - trafi jako
 *    PHOTO_DB_SCRIPT_URL w pliku js/photoDb.js.
 * 7. Przy KAŻDEJ przyszłej zmianie kodu: Wdróż -> Zarządzaj wdrożeniami -> ✏️ -> "Nowa wersja" TEGO
 *    SAMEGO wdrożenia (NIE twórz nowego wdrożenia) - inaczej adres /exec się zmieni.
 */

// ID dokumentu, do którego przypisany jest ten skrypt (z linku udostępniania).
const DOC_ID = '1AXNCEpFeKpu0D-wlJeybXLEfJtn9JGyyAo1nsX3tu2U';

const PHOTOGRAPHER_HEADING = 'Fotografowie';
const PHOTOGRAPHER_COLUMNS = ['name', 'handle', 'altNames'];
const PHOTOGRAPHER_HEADER_CELLS = ['Imię i nazwisko', 'Nazwa na Instagramie', 'Alternatywne pisownie'];

const UNIT_HEADING = 'Jednostki';
const UNIT_COLUMNS = ['name', 'handle', 'keywords'];
const UNIT_HEADER_CELLS = ['Nazwa jednostki', 'Nazwa na Instagramie', 'Słowa kluczowe'];

function doGet(e) {
  try {
    const type = (e.parameter && e.parameter.type) || 'photographers';
    const doc = DocumentApp.openById(DOC_ID);
    const data = type === 'units'
      ? readTable(doc, UNIT_HEADING, UNIT_COLUMNS, UNIT_HEADER_CELLS)
      : readTable(doc, PHOTOGRAPHER_HEADING, PHOTOGRAPHER_COLUMNS, PHOTOGRAPHER_HEADER_CELLS);
    return jsonResponse({ status: 'success', data: data });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err && err.message ? err.message : String(err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const doc = DocumentApp.openById(DOC_ID);

    if (body.action === 'addPhotographer') {
      upsertRow(doc, PHOTOGRAPHER_HEADING, PHOTOGRAPHER_COLUMNS, PHOTOGRAPHER_HEADER_CELLS, body);
    } else if (body.action === 'addUnit') {
      upsertRow(doc, UNIT_HEADING, UNIT_COLUMNS, UNIT_HEADER_CELLS, body);
    } else {
      throw new Error('Nieznana akcja: ' + body.action);
    }

    return jsonResponse({ status: 'success' });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err && err.message ? err.message : String(err) });
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Znajduje akapit z DOKŁADNIE tym tekstem, a zaraz po nim pierwszą tabelę - albo tworzy oba
// (nagłówek + tabela z jednym wierszem nagłówkowym), jeśli jeszcze nie istnieją. Jeśli tabela już
// istnieje, ZAWSZE synchronizuje tekst wiersza nagłówkowego z aktualnym `headerCells` - dzięki temu
// zmiana nazw kolumn w kodzie (np. "Uchwyt" -> "Nazwa na Instagramie") automatycznie odświeża się
// w JUŻ ISTNIEJĄCYM dokumencie przy następnym wywołaniu, bez ręcznej edycji przez admina.
function ensureTable(doc, heading, headerCells) {
  const body = doc.getBody();
  const numChildren = body.getNumChildren();

  for (let i = 0; i < numChildren; i++) {
    const el = body.getChild(i);
    if (el.getType() === DocumentApp.ElementType.PARAGRAPH && el.asParagraph().getText().trim() === heading) {
      for (let j = i + 1; j < numChildren; j++) {
        const next = body.getChild(j);
        if (next.getType() === DocumentApp.ElementType.TABLE) {
          const table = next.asTable();
          syncHeaderRow(table, headerCells);
          return table;
        }
      }
      // Nagłówek jest, ale tabeli po nim brak - dopisz ją zaraz za nim.
      return body.insertTable(i + 1, [headerCells]);
    }
  }

  // Nie ma ani nagłówka, ani tabeli - dopisz oba na końcu dokumentu.
  body.appendParagraph(heading).setHeading(DocumentApp.ParagraphHeading.HEADING2);
  return body.appendTable([headerCells]);
}

function syncHeaderRow(table, headerCells) {
  if (table.getNumRows() === 0) return;
  const headerRow = table.getRow(0);
  headerCells.forEach((text, c) => {
    if (headerRow.getNumCells() > c && headerRow.getCell(c).getText() !== text) {
      headerRow.getCell(c).setText(text);
    }
  });
}

function readTable(doc, heading, keys, headerCells) {
  const table = ensureTable(doc, heading, headerCells);
  const rows = [];

  for (let r = 1; r < table.getNumRows(); r++) { // r=0 to wiersz nagłówkowy
    const row = table.getRow(r);
    const obj = {};
    keys.forEach((key, c) => {
      const raw = row.getNumCells() > c ? row.getCell(c).getText().trim() : '';
      obj[key] = (key === 'altNames' || key === 'keywords')
        ? raw.split(',').map((s) => s.trim()).filter(Boolean)
        : raw;
    });
    if (obj[keys[0]]) rows.push(obj); // pomiń całkiem puste wiersze
  }

  return rows;
}

// Dopisuje NOWY wiersz, albo aktualizuje ISTNIEJĄCY (dopasowanie po pierwszej kolumnie "name",
// bez rozróżniania wielkości liter) - dzięki temu potwierdzenie/poprawka nazwy z aplikacji NIE
// tworzy duplikatów tej samej osoby/jednostki.
function upsertRow(doc, heading, keys, headerCells, data) {
  const table = ensureTable(doc, heading, headerCells);
  const nameKey = keys[0];
  const targetName = String(data[nameKey] || '').trim();
  if (!targetName) throw new Error('Brak pola "' + nameKey + '" w żądaniu.');

  for (let r = 1; r < table.getNumRows(); r++) {
    const row = table.getRow(r);
    if (row.getCell(0).getText().trim().toLowerCase() === targetName.toLowerCase()) {
      keys.forEach((key, c) => {
        if (data[key] === undefined) return;
        row.getCell(c).setText(cellValue(data[key]));
      });
      return;
    }
  }

  const newRow = table.appendTableRow();
  keys.forEach((key) => newRow.appendTableCell(cellValue(data[key])));
}

function cellValue(value) {
  if (Array.isArray(value)) return value.join(', ');
  return value === undefined || value === null ? '' : String(value);
}
