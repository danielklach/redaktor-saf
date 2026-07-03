import { Compressor } from './compressor.js';
import { Gemini } from './gemini.js';
import { Gutenberg } from './gutenberg.js';
import { getRememberedHandle, rememberHandle, verifyPermission } from './dirHandleStore.js';
import { I18n } from './i18n.js';

// Domena WordPressa - w ustawieniach Mediów odznaczone jest "Porządkuj wysyłane pliki w
// katalogi z numerami miesięcy i lat", więc pliki trafiają bezpośrednio do /wp-content/uploads/
// bez podkatalogów RRRR/MM (patrz renameAllFiles).
const WP_SITE_URL = "https://jamnik.uwm.edu.pl";

// Obrazek wyróżniający MUSI być poziomym zdjęciem w proporcjach 3:2 (wymóg WordPressa/stylu strony).
// Tolerancja pokrywa drobne niedokładności edytorów zdjęć (np. 3005x2000 zamiast idealnego 3000x2000).
const FEATURED_RATIO_TARGET = 3 / 2;
const RATIO_TOLERANCE = 0.03;

// Pkt 2 (v1.11.1): skróty nawigacyjne w adresie strony, osobne dla każdego trybu pracy, bo
// numeracja kroków 1-3 nie jest wspólna między trybami (patrz handleHashNavigation).
const HASH_ROUTES = {
    a1: ['auto', 'step1'], a2: ['auto', 'step2'], a3: ['auto', 'step3'],
    s1: ['semi', 'step2'], s2: ['semi', 'semiWriteStep'],
    m1: ['manual', 'step2']
};

// Pkt 1/2 (v1.11.2): pełna lista tekstów DYNAMICZNYCH (przekazywanych do this.t() w całym pliku) -
// zebrana w JEDNYM miejscu, żeby dało się je przetłumaczyć WSZYSTKIE naraz z wyprzedzeniem (patrz
// App.schedulePrecomputeTranslation/switchLanguage), zamiast czekać, aż każdy z nich pierwszy raz
// się wyświetli (co i tak by nie zdążyło - np. alert() blokuje wątek zanim tłumaczenie w tle
// dobiegnie końca). Jeśli dodajesz gdzieś nowe this.t('...'), dopisz TEN SAM literał tutaj.
const KNOWN_DYNAMIC_STRINGS = [
    'Żadne z wgranych zdjęć nie nadaje się na obrazek wyróżniający - musi być zdjęciem POZIOMYM w proporcjach 3:2. Dodaj przynajmniej jedno takie zdjęcie, zanim przejdziesz dalej.',
    'Aplikacja została zainstalowana! 🎉',
    'Nie udało się zapisać zdjęć:',
    'Zapisano', 'zdjęcie', 'zdjęć', 'w folderze',
    'Opisz proszę, na czym polega problem.',
    'Dzięki za zgłoszenie, zajmę się tym jak najszybciej!',
    'Nie udało się wysłać zgłoszenia:',
    'Agent nie ma dodatkowych pytań - możesz przejść dalej.',
    'Twoja odpowiedź (opcjonalnie)...',
    'BŁĄD: Musisz najpierw wybrać kategorię wpisu z listy.',
    'BŁĄD: Musisz najpierw wypełnić WSZYSTKIE pola, aby przejść do wgrywania zdjęć.',
    'BŁĄD: Data zakończenia wydarzenia nie może być wcześniejsza niż data rozpoczęcia. Popraw daty i spróbuj ponownie.',
    'BŁĄD: Musisz najpierw wypełnić pole notatek.',
    '⚠️ Nadal duże obciążenie serwerów Google - próbuję z alternatywnym modelem...',
    '⚠️ Serwery Google są mocno obciążone - ponawiam próbę',
    'Gotowe!',
    'Nie udało się połączyć z AI',
    'Czy chcesz samodzielnie dodać jakieś kluczowe szczegóły, o których zapomniałeś w notatkach?',
    'Błędny format pliku - pominięto', 'plik', 'plików',
    'Obsługiwane formaty: JPG, PNG, TIFF, DNG, WEBP, HEIC, HEIF, GIF, AVIF, BMP.',
    'Przygotowywanie', 'zdjęcia', 'Przetwarzanie',
    'Nie udało się przetworzyć', 'z',
    'Brak dodanych zdjęć. Przeciągnij pliki wyżej, aby je dodać.',
    'Nietypowe proporcje (zalecane 3:2, 2:3 lub pion 4:5)',
    'Obrazek wyróżniający musi być zdjęciem poziomym w proporcjach 3:2',
    'Waga:', 'Wyróżniające', 'Ustaw jako wyróżniające', 'Usuń',
    'Czy na pewno chcesz zacząć nowy wpis? Obecne dane, zdjęcia i wygenerowana treść zostaną utracone.',
    'Możesz zacząć pisać nowy wpis!',
    'Zmiana trybu pracy zresetuje formularz - obecne dane, zdjęcia i wygenerowana treść zostaną utracone. Kontynuować?',
    'Zmiana języka odświeży stronę - obecne dane, zdjęcia i wygenerowana treść zostaną utracone. Kontynuować?',
    'Nie udało się połączyć z wbudowanym AI',
    'Zdjęcia zachowały nazwy na podstawie nazwy wydarzenia z Kroku 1. Możesz skopiować kompletny prompt poniżej i wkleić go do dowolnego zewnętrznego czatu AI (np. ChatGPT, Claude, Gemini) - wynik będzie odpowiadał temu, co wygenerowałby Redaktor SAF.',
    'Skopiowano do schowka!',
    'Najpierw napisz treść artykułu, żeby AI mogło zaproponować tytuł.',
    'Nie udało się zaproponować tytułu:',
    'Najpierw napisz treść artykułu, żeby AI mogło zaproponować tagi.',
    'Nie udało się zaproponować tagów:',
    'Wpisz tytuł wpisu (albo kliknij "AI zasugeruj").',
    'Napisz treść artykułu, zanim spróbujesz go przekonwertować.',
    'Możesz skopiować kompletny prompt poniżej i wkleić go do dowolnego zewnętrznego czatu AI - poprosi go o to samo (poprawki literówek i pogrubienia), co próbowało zrobić wbudowane AI.',
    // Etykiety generowane dynamicznie w handleCategoryChange (zależne od wybranej kategorii)
    'Twoje surowe notatki / spostrzeżenia:',
    'Kto brał udział, jaka była atmosfera wydarzenia i co szczególnie przykuło uwagę naszych fotografów...',
    'np. Koncert Myslovitz…', 'np. MSKN...', 'np. Liga Wydziałów...',
    '<strong>Co dokładnie zapowiadasz, kiedy i gdzie to będzie?</strong>',
    'Opisz szczegółowo zapowiadane wydarzenie: co się wydarzy, kiedy dokładnie i gdzie...',
    '<strong>Opisz co się działo w agencji / jakie są ustalenia:</strong>',
    'Opisz przebieg spotkania lub wydarzenia w agencji: kto brał udział i jakie zapadły ustalenia...',
    // Etykiety etapów paska postępu (startProgressSimulation)
    'Agent analizuje wpisane dane...', 'Szuka wątków wartych dopytania...', 'Formułuje pytania pomocnicze...',
    'Analizuję notatki...', 'Redaguję tytuł i lead...', 'Piszę treść artykułu...', 'Dobieram tagi...',
    'Formatuję kod dla WordPressa...', 'Sprawdzam pisownię i literówki...', 'Dobieram pogrubienia i kursywę...'
];

// Zdarzenie beforeinstallprompt trzeba przechwycić NA POZIOMIE MODUŁU (nie wewnątrz App.init,
// które odpala się dopiero na DOMContentLoaded) - przeglądarka może je wysłać w dowolnym
// momencie ładowania strony i dostajemy tylko jedną szansę, żeby je złapać i zablokować
// domyślne zachowanie (e.preventDefault()).
let deferredInstallPrompt = null;
// Zabezpieczenie na wypadek, gdyby zdarzenie przyszło ZANIM App.init() zdążyło uruchomić
// cacheDOM() (np. bardzo wolne parsowanie strony) - wtedy this.installBanner jeszcze nie
// istnieje. Odkładamy obsługę do końca init() zamiast ryzykować błąd w konsoli.
let installPromptPending = false;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (App.installBanner) {
        App.onInstallPromptAvailable();
    } else {
        installPromptPending = true;
    }
});

// Po realnej instalacji nie ma już czego proponować - czyścimy zmienną, żeby żaden kolejny
// klik (np. ponowne otwarcie instrukcji) nie próbował odpalać już nieaktualnego promptu.
window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    App.onAppInstalled();
});

const App = {
    state: {
        // 'auto' (AI pisze całość) | 'semi' (autor pisze, AI tylko formatuje) | 'manual' (bez AI)
        mode: 'auto',
        currentStep: 'step1',
        interviewAnswers: "",
        aiFilenameSlug: null,
        // Ostatnio wygenerowane dane artykułu (title/lead/paragraphs/tags) - przechowywane, żeby
        // dało się je edytować w widoku tekstu i zregenerować z nich kod Gutenberga przed skopiowaniem.
        aiData: null,
        // Pkt 11: język interfejsu ('pl'|'en') - dotyczy WYŁĄCZNIE UI, nigdy treści artykułu (patrz App.t).
        lang: localStorage.getItem('saf_lang') || 'pl'
    },

    init() {
        this.cacheDOM();
        this.bindEvents();
        this.handleCategoryChange();
        this.switchStep('step1');
        this.initFileSystemSave();
        this.resetLinkRows();
        this.footerYear.textContent = new Date().getFullYear();
        this.renderFooterVersion();
        this.updateFileNamePreview();
        this.applyModeUI();
        this.handleHashNavigation();
        this.applyLangButtonUI();
        this.initLanguage();
        if (installPromptPending) {
            installPromptPending = false;
            this.onInstallPromptAvailable();
        }
        if (!localStorage.getItem('saf_intro_seen')) {
            this.introModal.classList.remove('hidden');
        }
    },

    cacheDOM() {
        this.logoHome = document.getElementById('logoHome');
        this.modeSwitcher = document.getElementById('modeSwitcher');

        this.btnShowIntro = document.getElementById('btnShowIntro');
        this.introModal = document.getElementById('introModal');
        this.btnCloseIntro = document.getElementById('btnCloseIntro');

        this.installBanner = document.getElementById('installBanner');
        this.btnInstallApp = document.getElementById('btnInstallApp');
        this.btnDismissInstall = document.getElementById('btnDismissInstall');

        this.btnReportIssue = document.getElementById('btnReportIssue');
        this.reportModal = document.getElementById('reportModal');
        this.reportCategory = document.getElementById('reportCategory');
        this.reportDescription = document.getElementById('reportDescription');
        this.btnCancelReport = document.getElementById('btnCancelReport');
        this.btnSendReport = document.getElementById('btnSendReport');
        this.btnReportFallback = document.getElementById('btnReportFallback');
        this.reportFallbackEmail = document.getElementById('reportFallbackEmail');
        this.toastContainer = document.getElementById('toastContainer');

        this.evtCategory = document.getElementById('evtCategory');
        this.step1CategoryHint = document.getElementById('step1CategoryHint');
        this.step1FormBody = document.getElementById('step1FormBody');
        this.step1Grid = document.getElementById('step1Grid');
        this.dynamicFields = document.getElementById('dynamicFields');
        this.notesLabel = document.getElementById('notesLabel');
        this.evtNotes = document.getElementById('evtNotes');
        this.evtExternalArticle = document.getElementById('evtExternalArticle');
        this.evtStart = document.getElementById('evtStart');
        this.evtEnd = document.getElementById('evtEnd');
        this.evtTitle = document.getElementById('evtTitle');
        this.evtLocation = document.getElementById('evtLocation');

        this.step2IntroAuto = document.getElementById('step2IntroAuto');
        this.step2IntroOther = document.getElementById('step2IntroOther');
        this.fileNamingFields = document.getElementById('fileNamingFields');
        this.fileNameMonth = document.getElementById('fileNameMonth');
        this.fileNameEventName = document.getElementById('fileNameEventName');
        this.fileNamePreview = document.getElementById('fileNamePreview');
        this.manualInstructions = document.getElementById('manualInstructions');

        this.dropzone = document.getElementById('dropzone');
        this.fileInput = document.getElementById('fileInput');
        this.fileStatus = document.getElementById('fileStatus');
        this.uploadProgressWrap = document.getElementById('uploadProgressWrap');
        this.uploadProgressBar = document.getElementById('uploadProgressBar');
        this.uploadProgressLabel = document.getElementById('uploadProgressLabel');

        this.btnGoToStep2 = document.getElementById('btnGoToStep2');
        this.btnBackToStep1 = document.getElementById('btnBackToStep1');
        this.btnGoToStep3 = document.getElementById('btnGoToStep3');
        this.btnBackToStep2 = document.getElementById('btnBackToStep2');
        this.btnDownloadPhotosStep3 = document.getElementById('btnDownloadPhotosStep3');
        this.btnSaveToComputer = document.getElementById('btnSaveToComputer');
        this.fsUnsupportedNote = document.getElementById('fsUnsupportedNote');
        this.downloadPhotosCta = document.getElementById('downloadPhotosCta');
        this.downloadCtaTextAuto = document.getElementById('downloadCtaTextAuto');
        this.downloadCtaTextOther = document.getElementById('downloadCtaTextOther');
        this.btnTriggerAI = document.getElementById('btnTriggerAI');
        this.btnCopyHtml = document.getElementById('btnCopyHtml');
        this.btnCopyTitle = document.getElementById('btnCopyTitle');
        this.btnRegenerate = document.getElementById('btnRegenerate');
        this.btnStartNew = document.getElementById('btnStartNew');

        this.aiModal = document.getElementById('aiModal');
        this.aiProgressWrap = document.getElementById('aiProgressWrap');
        this.aiProgressBar = document.getElementById('aiProgressBar');
        this.aiProgressLabel = document.getElementById('aiProgressLabel');
        this.aiRetryNotice = document.getElementById('aiRetryNotice');
        this.aiQuestionsContainer = document.getElementById('aiQuestionsContainer');
        this.btnSkipModal = document.getElementById('btnSkipModal');
        this.btnSubmitModal = document.getElementById('btnSubmitModal');

        this.step3 = document.getElementById('step3');
        this.step3Grid = this.step3.querySelector('.grid-2col');
        this.finalNotes = document.getElementById('finalNotes');
        this.linkInputGroup = document.querySelector('.link-input-group');
        this.linkRowsContainer = document.getElementById('linkRowsContainer');
        this.btnAddLink = document.getElementById('btnAddLink');
        this.btnCopyExternalPrompt = document.getElementById('btnCopyExternalPrompt');
        this.resultZone = document.getElementById('resultZone');
        this.aiEmptyState = document.getElementById('aiEmptyState');
        this.aiLoading = document.getElementById('aiLoading');
        this.genProgressBar = document.getElementById('genProgressBar');
        this.genProgressLabel = document.getElementById('genProgressLabel');
        this.genRetryNotice = document.getElementById('genRetryNotice');
        this.aiFallback = document.getElementById('aiFallback');
        this.aiFallbackMessage = document.getElementById('aiFallbackMessage');
        this.btnCopyFallbackPrompt = document.getElementById('btnCopyFallbackPrompt');
        this.aiOutput = document.getElementById('aiOutput');
        this.tabTextView = document.getElementById('tabTextView');
        this.tabCodeView = document.getElementById('tabCodeView');
        this.textViewPanel = document.getElementById('textViewPanel');
        this.codeViewPanel = document.getElementById('codeViewPanel');
        this.articleTextInput = document.getElementById('articleTextInput');
        this.gutenbergOutput = document.getElementById('gutenbergOutput');
        this.sugTitleInput = document.getElementById('sugTitleInput');
        this.sugDate = document.getElementById('sugDate');
        this.sugTagsInput = document.getElementById('sugTagsInput');
        this.btnCopyTags = document.getElementById('btnCopyTags');
        this.sugFeaturedImage = document.getElementById('sugFeaturedImage');
        this.metaSuggestion = document.getElementById('metaSuggestion');
        this.metaDateItem = document.getElementById('metaDateItem');
        this.aiActionsFooter = document.getElementById('aiActionsFooter');

        // Krok pisania w trybie pół-automatycznym
        this.semiWriteStep = document.getElementById('semiWriteStep');
        this.semiGrid = document.querySelector('#semiWriteStep .grid-2col');
        this.semiCategory = document.getElementById('semiCategory');
        this.semiTitleInput = document.getElementById('semiTitleInput');
        this.btnSuggestTitle = document.getElementById('btnSuggestTitle');
        this.semiTagsInput = document.getElementById('semiTagsInput');
        this.btnSuggestTags = document.getElementById('btnSuggestTags');
        this.semiArticleInput = document.getElementById('semiArticleInput');
        this.btnConvertSemi = document.getElementById('btnConvertSemi');
        this.btnCopyExternalPromptSemi = document.getElementById('btnCopyExternalPromptSemi');
        this.btnBackToStep2FromSemi = document.getElementById('btnBackToStep2FromSemi');
        this.btnStartNewSemi = document.getElementById('btnStartNewSemi');

        // Pkt 7 (v1.11.1): "porady" przed konwersją w trybie pół-automatycznym
        this.semiAdviceModal = document.getElementById('semiAdviceModal');
        this.semiAdviceList = document.getElementById('semiAdviceList');
        this.btnSemiAdviceFix = document.getElementById('btnSemiAdviceFix');
        this.btnSemiAdviceIgnore = document.getElementById('btnSemiAdviceIgnore');

        this.btnLangSwitch = document.getElementById('btnLangSwitch');
        this.flagEn = this.btnLangSwitch.querySelector('.flag-en');
        this.flagPl = this.btnLangSwitch.querySelector('.flag-pl');
        this.langCode = this.btnLangSwitch.querySelector('.lang-code');

        this.footerYear = document.getElementById('footerYear');
        this.footerVersion = document.getElementById('footerVersion');
    },

    bindEvents() {
        // Klik na logo/nazwę w nagłówku odświeża stronę (wraca do stanu początkowego, Krok 1).
        this.logoHome.addEventListener('click', (e) => {
            e.preventDefault();
            location.reload();
        });

        // Pozwala przeskoczyć do kroku wklejając np. "#3" w adresie, także BEZ przeładowania
        // strony (patrz handleHashNavigation) - przydatne przy testowaniu.
        window.addEventListener('hashchange', () => this.handleHashNavigation());

        this.modeSwitcher.addEventListener('change', (e) => this.switchMode(e.target.value));
        this.fileNameMonth.addEventListener('input', () => {
            this.updateFileNamePreview();
            if (Compressor.processedFiles.length > 0) this.renderFileList();
        });
        this.fileNameEventName.addEventListener('input', () => {
            this.updateFileNamePreview();
            if (Compressor.processedFiles.length > 0) this.renderFileList();
        });

        this.btnShowIntro.addEventListener('click', () => this.introModal.classList.remove('hidden'));
        this.btnCloseIntro.addEventListener('click', () => {
            this.introModal.classList.add('hidden');
            localStorage.setItem('saf_intro_seen', '1');
            // Pierwsza interakcja użytkownika ze stroną (zamknięcie instrukcji) - najlepszy,
            // najmniej inwazyjny moment, żeby zaproponować instalację (patrz triggerInstallPrompt).
            this.triggerInstallPrompt();
        });

        this.btnInstallApp.addEventListener('click', () => this.triggerInstallPrompt());
        // Zamknięcie chowa popup TYLKO do końca bieżącego wczytania strony - żadnej trwałej pamięci
        // (patrz komentarz w onInstallPromptAvailable), więc przy odświeżeniu wyskoczy ponownie.
        this.btnDismissInstall.addEventListener('click', () => {
            this.installBanner.classList.add('hidden');
        });

        this.btnReportIssue.addEventListener('click', () => {
            this.reportModal.classList.remove('hidden');
            this.reportFallbackEmail.classList.add('hidden');
        });
        this.btnCancelReport.addEventListener('click', () => this.reportModal.classList.add('hidden'));
        this.btnSendReport.addEventListener('click', () => this.sendReport());
        // Na wszelki wypadek, gdyby padł też sam formularz zgłoszeń - pokazuje maila jako zwykły
        // tekst do ręcznego skopiowania (celowo NIE mailto:, żeby zawsze działało niezależnie od klienta pocztowego).
        this.btnReportFallback.addEventListener('click', (e) => {
            e.preventDefault();
            this.reportFallbackEmail.classList.toggle('hidden');
        });

        this.evtCategory.addEventListener('change', () => this.handleCategoryChange());

        this.evtStart.addEventListener('change', (e) => {
            if (e.target.value) {
                // Domyślnie ustawiamy koniec RÓWNY początkowi (nie 00:00 tego samego dnia) -
                // 00:00 bywało wcześniejsze niż wieczorne wydarzenia i fałszywie wywoływało
                // walidację "data zakończenia wcześniejsza niż rozpoczęcia" (patrz handleStep1Submit).
                this.evtEnd.value = e.target.value;
            }
        });

        this.btnGoToStep2.addEventListener('click', () => this.handleStep1Submit());
        this.btnBackToStep1.addEventListener('click', () => this.switchStep('step1'));

        this.dropzone.addEventListener('click', (e) => {
            e.preventDefault();
            if (this._processingFiles) return;
            this.fileInput.click();
        });

        this.fileInput.addEventListener('change', (e) => this.handleFiles(e.target.files));

        this.dropzone.addEventListener('dragover', (e) => { e.preventDefault(); if (!this._processingFiles) this.dropzone.style.borderColor = 'var(--primary)'; });
        this.dropzone.addEventListener('dragleave', () => { this.dropzone.style.borderColor = 'var(--border)'; });
        this.dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.dropzone.style.borderColor = 'var(--border)';
            if (this._processingFiles) return;
            this.handleFiles(e.dataTransfer.files);
        });

        this.btnDownloadPhotosStep3.addEventListener('click', () => this.downloadPhotosZip());
        this.btnSaveToComputer.addEventListener('click', () => this.saveToComputer());

        this.tabTextView.addEventListener('click', () => this.switchOutputTab('text'));
        this.tabCodeView.addEventListener('click', () => this.switchOutputTab('code'));

        this.btnGoToStep3.addEventListener('click', () => {
            // Ta walidacja obrazka wyróżniającego dotyczy WSZYSTKICH trybów - zawsze potrzebny
            // jest jeden poziomy plik 3:2, niezależnie od tego, kto/co napisze treść.
            const hasFeaturedCandidate = Compressor.processedFiles.some(f => f.isFeatured || this.canBeFeatured(f));
            if (!hasFeaturedCandidate) {
                alert(this.t('Żadne z wgranych zdjęć nie nadaje się na obrazek wyróżniający - musi być zdjęciem POZIOMYM w proporcjach 3:2. Dodaj przynajmniej jedno takie zdjęcie, zanim przejdziesz dalej.'));
                return;
            }
            if (this.state.mode === 'semi') {
                this.goToSemiWriteStep();
            } else {
                this.goToStep3();
            }
        });
        this.btnBackToStep2.addEventListener('click', () => {
            // Jeśli AI właśnie generuje artykuł (albo ponawia próbę) - przerywamy to żądanie,
            // żeby nie płacić za odpowiedź, której i tak nikt już nie zobaczy (patrz generateArticle).
            this._articleAbortController?.abort();
            this.switchStep('step2');
            this.renderFileList(); // odśwież listę - nazwy mogły się zmienić po Kroku 3 (slug od AI)
        });
        this.btnBackToStep2FromSemi.addEventListener('click', () => {
            this._semiAbortController?.abort();
            this.switchStep('step2');
            this.renderFileList();
        });

        this.btnSubmitModal.addEventListener('click', () => this.closeModal(true));
        this.btnSkipModal.addEventListener('click', () => {
            // "Pomiń" musi działać NATYCHMIAST, nawet w trakcie oczekiwania na AI/ponawiania prób
            // (patrz handleStep1Submit) - stąd przerwanie żądania przez AbortController.
            this._interviewAbortController?.abort();
            this.closeModal(false);
        });

        this.btnAddLink.addEventListener('click', () => this.addLinkRow());
        this.btnTriggerAI.addEventListener('click', () => this.generateArticle());
        this.btnCopyHtml.addEventListener('click', () => this.copyGutenbergCode());
        this.btnCopyTitle.addEventListener('click', () => this.copyTitle());
        this.btnCopyTags.addEventListener('click', () => this.copyTags());
        // Ten sam przycisk (duży, widoczny WYŁĄCZNIE przy błędzie) i dyskretny link (zawsze
        // dostępny) wołają teraz jedną, wspólną metodę - patrz buildExternalPromptText/copyExternalPrompt.
        this.btnCopyFallbackPrompt.addEventListener('click', () => this.copyExternalPrompt());
        this.btnCopyExternalPrompt.addEventListener('click', () => this.copyExternalPrompt());
        this.btnCopyExternalPromptSemi.addEventListener('click', () => this.copyExternalPrompt());
        this.btnRegenerate.addEventListener('click', () => {
            this.setResultState('empty');
            this.finalNotes.focus();
        });
        this.btnStartNew.addEventListener('click', () => this.startNewPost());
        this.btnStartNewSemi.addEventListener('click', () => this.startNewPost());

        this.btnSuggestTitle.addEventListener('click', () => this.suggestSemiTitle());
        this.btnSuggestTags.addEventListener('click', () => this.suggestSemiTags());
        this.btnConvertSemi.addEventListener('click', () => this.convertSemiArticle());

        this.btnSemiAdviceFix.addEventListener('click', () => {
            this.semiAdviceModal.classList.add('hidden');
            this.semiArticleInput.focus();
        });
        this.btnSemiAdviceIgnore.addEventListener('click', () => {
            this.semiAdviceModal.classList.add('hidden');
            const pending = this._pendingSemiConversion;
            if (pending) this.runSemiConversion(pending.title, pending.articleRaw);
        });

        this.btnLangSwitch.addEventListener('click', () => this.switchLanguage(this.state.lang === 'pl' ? 'en' : 'pl'));
    },

    // Jedyne miejsce pobierania zdjęć jest w Kroku 3 (po ewentualnym przemianowaniu przez AI),
    // dzięki czemu nazwy w paczce ZAWSZE zgadzają się z linkami w wygenerowanym artykule -
    // nie trzeba już niczego pilnować ani ostrzegać, wystarczy usunąć wcześniejszą możliwość pobrania w Kroku 2.
    downloadPhotosZip() {
        this.ensureFeaturedImage();
        this.renameAllFiles();
        const { eventTitle, eventDateStr } = this.getFileNamingSource();
        Compressor.generateZip(eventTitle, eventDateStr);
    },

    // Wywoływane z listenera beforeinstallprompt (patrz góra pliku) w chwili, gdy przeglądarka
    // faktycznie jest gotowa zaproponować instalację. Najpierw próbujemy pokazać okno OD RAZU -
    // w praktyce niemal każda przeglądarka i tak to zablokuje bez gestu użytkownika (rzuci
    // wyjątkiem), więc triggerInstallPrompt() bezpiecznie łapie błąd, a my pokazujemy widoczny
    // popup, który da nam ten gest przy pierwszym kliknięciu (albo zamknięciu instrukcji startowej).
    async onInstallPromptAvailable() {
        // Już zainstalowana (PWA na pulpicie/telefonie) albo "Dodaj do ekranu głównego" na iOS -
        // nie ma sensu niczego proponować.
        if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
            return;
        }

        const shownImmediately = await this.triggerInstallPrompt();
        if (shownImmediately) return;

        // Celowo BEZ zapamiętywania odrzucenia (ani w localStorage, ani w sessionStorage) -
        // popup ma się pokazywać przy KAŻDYM odświeżeniu strony, dopóki aplikacja nie zostanie
        // zainstalowana. Zamknięcie przyciskiem "✕" chowa go tylko do końca bieżącego wczytania strony.
        this.installBanner.classList.remove('hidden');
    },

    // Współdzielone przez popup instalacji ORAZ przycisk zamykający instrukcję startową -
    // niezależnie skąd wywołane, bezpiecznie działa też w przeglądarkach bez wsparcia dla PWA
    // (deferredInstallPrompt jest wtedy po prostu null, więc metoda nic nie robi i niczego nie rzuca).
    async triggerInstallPrompt() {
        if (!deferredInstallPrompt) return false;
        try {
            await deferredInstallPrompt.prompt();
            const choice = await deferredInstallPrompt.userChoice;
            console.log('[PWA] Wybór użytkownika w oknie instalacji:', choice.outcome);
            deferredInstallPrompt = null; // zdarzenie jednorazowe - zużyte po udanym pokazaniu okna
            this.installBanner.classList.add('hidden');
            return true;
        } catch (err) {
            // Najczęstsza przyczyna: prompt() wywołany bez gestu użytkownika (np. próba tuż po
            // załadowaniu strony) - to nie błąd aplikacji, po prostu czekamy na kliknięcie.
            console.warn('[PWA] Okno instalacji nie mogło się pokazać:', err.message);
            return false;
        }
    },

    onAppInstalled() {
        this.installBanner?.classList.add('hidden');
        this.showToast(this.t('Aplikacja została zainstalowana! 🎉'));
    },

    // File System Access API pozwala zapisać zdjęcia BEZPOŚREDNIO na dysk, bez ZIP-a i bez
    // ręcznego rozpakowywania - dostępne na razie tylko w Chrome/Edge (komputer i Android).
    // Safari/iOS tego nie wspiera, więc dla nich zostaje wyłącznie ZIP (patrz fsUnsupportedNote).
    async initFileSystemSave() {
        this.fsSupported = typeof window.showDirectoryPicker === 'function';
        if (!this.fsSupported) {
            this.fsUnsupportedNote.classList.remove('hidden');
            return;
        }
        this.btnSaveToComputer.classList.remove('hidden');

        const remembered = await getRememberedHandle();
        if (remembered) this._rememberedDirHandle = remembered;
    },

    // Jeden przycisk, jedna decyzja: jeśli mamy już zapamiętany (i wciąż ważny) folder z
    // poprzedniego zapisu, używamy go od razu bez dodatkowych pytań. W przeciwnym razie (albo
    // gdy uprawnienia wygasły) pokazujemy natywny wybór folderu i zapamiętujemy go na przyszłość -
    // celowo BEZ osobnego, drugiego przycisku "zapisz w tym samym miejscu", żeby nie mnożyć opcji.
    async saveToComputer() {
        try {
            if (this._rememberedDirHandle && await verifyPermission(this._rememberedDirHandle)) {
                await this.performDirectorySave(this._rememberedDirHandle);
                return;
            }
            const dirHandle = await window.showDirectoryPicker({ id: 'safPhotos', startIn: 'downloads' });
            await this.performDirectorySave(dirHandle);
        } catch (err) {
            if (err.name === 'AbortError') return; // użytkownik zamknął okno wyboru - nic się nie stało
            alert(this.t('Nie udało się zapisać zdjęć:') + ' ' + err.message);
        }
    },

    async performDirectorySave(dirHandle) {
        this.ensureFeaturedImage();
        this.renameAllFiles();
        const { eventTitle, eventDateStr } = this.getFileNamingSource();

        const { folderName, count } = await Compressor.saveToDirectory(dirHandle, eventTitle, eventDateStr);

        await rememberHandle(dirHandle);
        this._rememberedDirHandle = dirHandle;

        this.showToast(`${this.t('Zapisano')} ${count} ${count === 1 ? this.t('zdjęcie') : this.t('zdjęć')} ${this.t('w folderze')} "${folderName}"!`);
    },

    // Sprawdza proporcje oryginalnego zdjęcia (3:2, poziomo) z tolerancją na drobne niedokładności.
    isRatioClose(actual, target) {
        return Math.abs(actual - target) / target <= RATIO_TOLERANCE;
    },

    // Zwraca informacje o proporcjach zdjęcia: czy są znane, czy mieszczą się w zalecanych
    // wartościach (3:2, 2:3, pion 4:5) i czy kwalifikują się na obrazek wyróżniający (TYLKO poziome 3:2).
    getRatioInfo(file) {
        if (!file.width || !file.height) return { known: false, acceptable: true, featuredEligible: false };
        const ratio = file.width / file.height;
        const isLandscape32 = this.isRatioClose(ratio, FEATURED_RATIO_TARGET);
        const isPortrait23 = this.isRatioClose(ratio, 2 / 3);
        const isPortrait45 = this.isRatioClose(ratio, 4 / 5);
        return {
            known: true,
            acceptable: isLandscape32 || isPortrait23 || isPortrait45,
            featuredEligible: isLandscape32
        };
    },

    canBeFeatured(file) {
        return this.getRatioInfo(file).featuredEligible;
    },

    // Jeśli nikt jeszcze nie jest oznaczony jako wyróżniający, losuje jeden z kwalifikujących się
    // (poziomych, 3:2) plików. Jeśli żaden się nie kwalifikuje, świadomie NIE ustawia nikogo -
    // lepiej brak obrazka wyróżniającego niż złamanie obowiązkowej reguły proporcji.
    ensureFeaturedImage() {
        if (Compressor.processedFiles.length === 0) return;
        if (Compressor.processedFiles.some(f => f.isFeatured)) return;

        const eligible = Compressor.processedFiles
            .map((f, i) => ({ f, i }))
            .filter(({ f }) => this.canBeFeatured(f));
        if (eligible.length === 0) return;

        const pick = eligible[Math.floor(Math.random() * eligible.length)];
        this.setFeaturedImage(pick.i);
    },

    // Pkt 1/4 (v1.11.2): każde przełączenie języka teraz przeładowuje CAŁĄ stronę (location.reload)
    // zamiast podmieniać teksty w locie - eliminuje to ryzyko "połowicznego" tłumaczenia (część
    // elementów po angielsku, część nadal po polsku) i sprawia, że powrót na polski jest ZAWSZE
    // idealnie czysty (to po prostu naturalna treść z pliku HTML, bez żadnej rekonstrukcji w JS).
    // Zanim faktycznie przełączymy na EN, upewniamy się (ensureReady), że tłumaczenie jest już
    // GOTOWE w cache'u - dzięki temu przeładowana strona pokazuje angielski interfejs od razu,
    // bez zauważalnego opóźnienia (patrz initLanguage/lang-loading overlay w index.html).
    async switchLanguage(lang) {
        if (lang === this.state.lang) return;

        // Przełączenie języka teraz przeładowuje stronę (patrz komentarz wyżej), a to skasowałoby
        // niezapisane dane (zdjęcia trzymane są WYŁĄCZNIE w pamięci JS) - ostrzegamy więc dokładnie
        // tak samo, jak przy zmianie trybu pracy (switchMode) czy "Generuj kolejny wpis", i TYLKO
        // jeśli faktycznie jest coś do stracenia.
        if (this.hasUnsavedContent() && !window.confirm(this.t('Zmiana języka odświeży stronę - obecne dane, zdjęcia i wygenerowana treść zostaną utracone. Kontynuować?'))) {
            return;
        }

        if (lang === 'pl') {
            localStorage.setItem('saf_lang', 'pl');
            location.reload();
            return;
        }

        this.btnLangSwitch.disabled = true;
        try {
            await I18n.ensureReady(KNOWN_DYNAMIC_STRINGS);
        } catch (error) {
            this.btnLangSwitch.disabled = false;
            alert('Sorry, this function is temporarily unavailable.');
            return;
        }
        localStorage.setItem('saf_lang', 'en');
        location.reload();
    },

    // Ustawia flagę + etykietę na przycisku PL/EN zgodnie z AKTUALNYM językiem - pokazuje flagę
    // i skrót JĘZYKA, na który kliknięcie przełączy (np. w trybie polskim pokazuje flagę UK / "EN").
    applyLangButtonUI() {
        const switchingToEn = this.state.lang === 'pl';
        this.flagEn.classList.toggle('hidden', !switchingToEn);
        this.flagPl.classList.toggle('hidden', switchingToEn);
        this.langCode.textContent = switchingToEn ? 'EN' : 'PL';
    },

    // Wywoływane RAZ przy starcie aplikacji: jeśli zapisany język to angielski, strona jest
    // maskowana nakładką (patrz inline-script + #langLoadingOverlay w index.html, ustawiony
    // ZANIM ten moduł się w ogóle załadował, żeby uniknąć choćby krótkiego mignięcia polskiego
    // tekstu) - tłumaczenie w tym momencie powinno już być w cache'u (patrz
    // schedulePrecomputeTranslation z POPRZEDNIEJ sesji w języku polskim), więc zastosowanie go
    // jest praktycznie natychmiastowe. Jeśli język to polski, zamiast tego cicho dogrzewamy cache
    // angielski w tle, żeby PRZYSZŁE przełączenie było błyskawiczne (pkt 1).
    async initLanguage() {
        document.documentElement.lang = this.state.lang === 'en' ? 'en' : 'pl';

        if (this.state.lang === 'en') {
            try {
                await I18n.applyEnglish(KNOWN_DYNAMIC_STRINGS);
            } catch (error) {
                console.warn('[i18n] Nie udało się zastosować zapisanego języka:', error.message);
            } finally {
                this.hideLangLoadingOverlay();
            }
            return;
        }

        this.hideLangLoadingOverlay();
        this.schedulePrecomputeTranslation();
    },

    hideLangLoadingOverlay() {
        document.documentElement.classList.remove('lang-loading');
    },

    schedulePrecomputeTranslation() {
        const run = () => {
            I18n.ensureReady(KNOWN_DYNAMIC_STRINGS).catch(error => {
                console.warn('[i18n] Wstępne tłumaczenie w tle nie powiodło się (spróbuje ponownie przy kliknięciu):', error.message);
            });
        };
        if ('requestIdleCallback' in window) {
            requestIdleCallback(run, { timeout: 4000 });
        } else {
            setTimeout(run, 1500);
        }
    },

    // Tłumaczenie tekstów DYNAMICZNYCH (alert/toast/komunikaty) - w trybie PL zwraca oryginał bez
    // zmian; w trybie EN zwraca wersję z cache'u (powinna tam już być, patrz KNOWN_DYNAMIC_STRINGS
    // + schedulePrecomputeTranslation/ensureReady). Jeśli mimo wszystko jeszcze nie jest cache'owana
    // (np. string dopisany do kodu, ale zapomniany w manifeście), zwraca oryginał i dopisuje go do
    // kolejki tłumaczenia w tle jako siatkę bezpieczeństwa - kolejne wywołanie skorzysta z cache'u.
    t(text) {
        if (this.state.lang === 'pl' || !text) return text;
        if (!this._translationCache) this._translationCache = I18n.getCache();
        const cached = this._translationCache[text];
        if (cached) return cached;
        this._queueDynamicTranslation(text);
        return text;
    },

    _queueDynamicTranslation(text) {
        if (!this._dynamicQueue) this._dynamicQueue = new Set();
        this._dynamicQueue.add(text);
        clearTimeout(this._dynamicQueueTimer);
        this._dynamicQueueTimer = setTimeout(() => this._flushDynamicQueue(), 400);
    },

    async _flushDynamicQueue() {
        if (!this._dynamicQueue || this._dynamicQueue.size === 0) return;
        const strings = Array.from(this._dynamicQueue);
        this._dynamicQueue.clear();
        try {
            const translations = await Gemini.translateStrings(strings);
            if (!this._translationCache) this._translationCache = I18n.getCache();
            strings.forEach((s, i) => { this._translationCache[s] = translations[i]; });
            I18n.saveCache(this._translationCache);
        } catch (e) {
            console.warn('[i18n] Nie udało się przetłumaczyć tekstów dynamicznych:', e.message);
        }
    },

    // Tłumaczy w REALNYM CZASIE pytania wygenerowane przez agenta AI (askForMissingDetails) - to
    // treść inna za KAŻDYM razem (zależna od notatek użytkownika), więc nie da się jej wcześniej
    // przygotować w cache'u jak KNOWN_DYNAMIC_STRINGS. Zwraca DWIE równoległe tablice: oryginalne
    // (polskie, do zapisania jako dataset.question - trafiają do promptu generującego artykuł,
    // który MUSI zostać po polsku niezależnie od języka interfejsu) i do wyświetlenia (przetłumaczone,
    // gdy interfejs jest po angielsku). W razie błędu tłumaczenia po prostu pokazuje oryginały.
    async translateForDisplay(strings) {
        if (this.state.lang === 'pl' || !strings || strings.length === 0) return strings;
        try {
            return await Gemini.translateStrings(strings);
        } catch (error) {
            console.warn('[i18n] Nie udało się przetłumaczyć pytań agenta na żywo:', error.message);
            return strings;
        }
    },

    // Toast notification nienachalny popup na dole ekranu, zamiast systemowego alert() (pkt UI/UX).
    showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        this.toastContainer.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('show'));
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    // Anonimowe zgłoszenie: użytkownik tylko opisuje problem i klika "Wyślij" - Google Apps
    // Script (patrz js/gemini.js -> sendIssueReport) sam przekazuje treść na maila webmastera,
    // bez żadnej akcji ze strony użytkownika (bez mailto:, bez jego klienta pocztowego).
    async sendReport() {
        const category = this.reportCategory.value;
        const description = this.reportDescription.value.trim();
        if (!description) {
            alert(this.t('Opisz proszę, na czym polega problem.'));
            return;
        }

        this.btnSendReport.disabled = true;
        try {
            await Gemini.sendIssueReport(category, description);
            this.reportModal.classList.add('hidden');
            this.reportDescription.value = '';
            this.showToast(this.t('Dzięki za zgłoszenie, zajmę się tym jak najszybciej!'));
        } catch (error) {
            alert(this.t('Nie udało się wysłać zgłoszenia:') + ' ' + error.message);
        } finally {
            this.btnSendReport.disabled = false;
        }
    },

    handleCategoryChange() {
        const category = this.evtCategory.value;

        // Dopóki kategoria nie jest wybrana, reszta formularza jest ukryta - inaczej pusty
        // "dynamicFields" psuł siatkę 2-kolumnową i wyglądał na niedokończony (patrz też niżej).
        if (!category) {
            this.step1FormBody.classList.add('hidden');
            this.step1CategoryHint.classList.remove('hidden');
            return;
        }
        this.step1FormBody.classList.remove('hidden');
        this.step1CategoryHint.classList.add('hidden');

        if (category === 'kultura' || category === 'sport' || category === 'nauka') {
            this.dynamicFields.style.display = 'block';
            this.step1Grid.classList.remove('single-col');
            this.notesLabel.innerHTML = this.t("Twoje surowe notatki / spostrzeżenia:");
            this.evtNotes.placeholder = this.t("Kto brał udział, jaka była atmosfera wydarzenia i co szczególnie przykuło uwagę naszych fotografów...");

            if (category === 'kultura') { this.evtTitle.placeholder = this.t("np. Koncert Myslovitz…"); }
            else if (category === 'nauka') { this.evtTitle.placeholder = this.t("np. MSKN..."); }
            else if (category === 'sport') { this.evtTitle.placeholder = this.t("np. Liga Wydziałów..."); }
        } else {
            this.dynamicFields.style.display = 'none';
            // Bez pól tytuł/miejsce/daty druga kolumna (notatki) zajmuje całą szerokość siatki.
            this.step1Grid.classList.add('single-col');
            if (category === 'zapowiedzi') {
                this.notesLabel.innerHTML = this.t("<strong>Co dokładnie zapowiadasz, kiedy i gdzie to będzie?</strong>");
                this.evtNotes.placeholder = this.t("Opisz szczegółowo zapowiadane wydarzenie: co się wydarzy, kiedy dokładnie i gdzie...");
            } else if (category === 'zycie') {
                this.notesLabel.innerHTML = this.t("<strong>Opisz co się działo w agencji / jakie są ustalenia:</strong>");
                this.evtNotes.placeholder = this.t("Opisz przebieg spotkania lub wydarzenia w agencji: kto brał udział i jakie zapadły ustalenia...");
            }
        }
    },

    // "step" to ZAWSZE id sekcji (np. "step1", "step2", "semiWriteStep") - dzięki temu ta sama
    // metoda obsługuje zarówno kroki trybu automatycznego, jak i sekcje trybów pół-automatycznego
    // i manualnego, których nie da się ponumerować w jednym wspólnym ciągu 1/2/3 (patrz applyModeUI).
    // Wskaźnik kroków (.steps-indicator) filtrowany jest dodatkowo po aktualnym trybie, bo kilka
    // pozycji w nim celowo dzieli to samo "data-step" (np. step2 jest wspólny dla 3 trybów).
    switchStep(step) {
        this.state.currentStep = step;
        document.querySelectorAll('.step-section').forEach(s => { s.style.display = 'none'; s.classList.remove('active'); });
        document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));

        const targetSection = document.getElementById(step);
        if (targetSection) { targetSection.style.display = 'block'; targetSection.classList.add('active'); }

        const targetIndicator = document.querySelector(`.step[data-step="${step}"][data-modes="${this.state.mode}"]`);
        if (targetIndicator) { targetIndicator.classList.add('active'); }
    },

    // W adresie strony można wkleić np. "#a3"/"#s2"/"#m1", żeby od razu przeskoczyć do danego
    // kroku danego trybu - wygodne przy testowaniu, żeby nie trzeba było za każdym razem ręcznie
    // przechodzić przez wcześniejsze kroki. Celowo pomija normalną walidację (handleStep1Submit/
    // goToStep3) i resetAllFormState - to skrót WYŁĄCZNIE nawigacyjny, więc pola danego kroku
    // mogą zostać puste, a dane z innych trybów NIE są czyszczone.
    handleHashNavigation() {
        const match = window.location.hash.match(/^#([asm][0-9]+)$/);
        if (!match) return;
        const route = HASH_ROUTES[match[1]];
        if (!route) return;

        const [mode, step] = route;
        if (mode !== this.state.mode) {
            this.state.mode = mode;
            this.modeSwitcher.value = mode;
            this.updateStepsIndicatorForMode();
            this.updateStep2FieldsForMode();
            this.repositionSharedBlocks();
        }
        this.switchStep(step);
    },

    // Wersja i data jej wprowadzenia w stopce - czytane BEZPOŚREDNIO z nagłówka (.logo-version
    // i jego atrybutu data-release-date), żeby aktualizacja wersji w jednym miejscu (nagłówek)
    // wystarczyła - bez ręcznego powtarzania tej samej informacji w stopce.
    renderFooterVersion() {
        const versionEl = document.querySelector('.logo-version');
        if (!versionEl) return;
        const releaseDate = versionEl.dataset.releaseDate;
        let dateLabel = '';
        if (releaseDate) {
            const parsed = new Date(releaseDate);
            if (!isNaN(parsed)) {
                dateLabel = ` (${parsed.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })})`;
            }
        }
        this.footerVersion.textContent = `${versionEl.textContent}${dateLabel}`;
    },

    // Pkt 1: uniwersalny, symulowany pasek postępu z rotującymi komunikatami etapów.
    // Nie udaje 100% dopóki prawdziwa odpowiedź faktycznie nie przyjdzie (asymptotyczne dobicie do ~92%).
    startProgressSimulation(barEl, labelEl, wrapEls, stages, estimatedMs = 8000) {
        wrapEls.forEach(el => el.classList.remove('hidden'));
        let pct = 4;
        let stageIndex = 0;
        barEl.style.width = pct + '%';
        labelEl.textContent = stages[0];

        const stageIntervalMs = Math.max(1200, Math.floor(estimatedMs / stages.length));
        let elapsed = 0;

        const tick = setInterval(() => {
            elapsed += 300;
            pct = pct + (92 - pct) * 0.06;
            barEl.style.width = Math.min(pct, 92).toFixed(0) + '%';

            const nextStage = Math.min(stages.length - 1, Math.floor(elapsed / stageIntervalMs));
            if (nextStage !== stageIndex) {
                stageIndex = nextStage;
                labelEl.textContent = stages[stageIndex];
            }
        }, 300);

        return {
            finish: (finalLabel) => {
                clearInterval(tick);
                barEl.style.width = '100%';
                if (finalLabel) labelEl.textContent = finalLabel;
                setTimeout(() => wrapEls.forEach(el => el.classList.add('hidden')), 500);
            },
            stop: () => {
                clearInterval(tick);
                wrapEls.forEach(el => el.classList.add('hidden'));
            }
        };
    },

    // Komunikat o ponawianiu próby przy przeciążeniu API Google (patrz js/gemini.js ->
    // callGeminiRaw) - CELOWO osobny element od rotującej etykiety etapu (aiProgressLabel/
    // genProgressLabel), żeby interval z startProgressSimulation go od razu nie nadpisał.
    showRetryNotice(noticeEl, message) {
        noticeEl.textContent = message;
        noticeEl.classList.remove('hidden');
    },

    hideRetryNotice(noticeEl) {
        noticeEl.classList.add('hidden');
    },

    // Pkt 2: buduje ponumerowane pytania, każde z własnym polem odpowiedzi TUŻ pod nim.
    // "displayQuestions" (opcjonalne, domyślnie = questions) to wersja do WYŚWIETLENIA - w trybie
    // angielskim to tłumaczenie na żywo (patrz translateForDisplay) - a "questions" (zawsze polskie)
    // zostają zapisane w dataset.question, bo to one budują prompt generujący artykuł.
    renderQuestions(questions, displayQuestions) {
        displayQuestions = displayQuestions || questions;
        this.aiQuestionsContainer.innerHTML = "";

        if (!questions || questions.length === 0) {
            this.aiQuestionsContainer.innerHTML = `<p class="info-text">${this.t('Agent nie ma dodatkowych pytań - możesz przejść dalej.')}</p>`;
            return;
        }

        questions.forEach((q, idx) => {
            const block = document.createElement('div');
            block.className = 'question-block';

            const qTitle = document.createElement('div');
            qTitle.className = 'q-title';
            qTitle.textContent = `${idx + 1}. ${displayQuestions[idx] ?? q}`;

            const answer = document.createElement('textarea');
            answer.className = 'question-answer';
            answer.rows = 3;
            answer.placeholder = this.t("Twoja odpowiedź (opcjonalnie)...");
            answer.dataset.question = q;

            block.appendChild(qTitle);
            block.appendChild(answer);
            this.aiQuestionsContainer.appendChild(block);
        });
    },

    // Pełna walidacja przed uruchomieniem inteligentnego AI (Punkty 1, 2 i 3)
    async handleStep1Submit() {
        const cat = this.evtCategory.value;
        const title = this.evtTitle?.value || "";
        const loc = this.evtLocation?.value || "";
        const start = this.evtStart?.value || "";
        const end = this.evtEnd?.value || "";
        const notes = this.evtNotes.value.trim();

        if (!cat) {
            alert(this.t("BŁĄD: Musisz najpierw wybrać kategorię wpisu z listy."));
            return;
        }

        if (cat === 'kultura' || cat === 'sport' || cat === 'nauka') {
            if (!title || !loc || !start || !end || !notes) {
                alert(this.t("BŁĄD: Musisz najpierw wypełnić WSZYSTKIE pola, aby przejść do wgrywania zdjęć."));
                return;
            }
            if (new Date(end) < new Date(start)) {
                alert(this.t("BŁĄD: Data zakończenia wydarzenia nie może być wcześniejsza niż data rozpoczęcia. Popraw daty i spróbuj ponownie."));
                return;
            }
        } else {
            if (!notes) {
                alert(this.t("BŁĄD: Musisz najpierw wypełnić pole notatek."));
                return;
            }
        }

        this.aiModal.classList.remove('hidden');
        this.btnSubmitModal.disabled = true;
        // "Pomiń" CELOWO zostaje aktywny przez cały czas oczekiwania (nawet w trakcie ponawiania
        // prób przy przeciążeniu API) - użytkownik może przerwać czekanie w dowolnym momencie
        // (patrz handler btnSkipModal w bindEvents, który przerywa to żądanie przez AbortController).
        this.aiQuestionsContainer.innerHTML = "";

        this._interviewAbortController = new AbortController();
        const { signal } = this._interviewAbortController;

        const progress = this.startProgressSimulation(
            this.aiProgressBar,
            this.aiProgressLabel,
            [this.aiProgressWrap, this.aiProgressLabel],
            [
                this.t("Agent analizuje wpisane dane..."),
                this.t("Szuka wątków wartych dopytania..."),
                this.t("Formułuje pytania pomocnicze...")
            ],
            6000
        );

        try {
            const questions = await Gemini.askForMissingDetails(cat, title, loc, start, end, notes, {
                signal,
                onRetry: (attempt, maxAttempts, isFallback) => this.showRetryNotice(
                    this.aiRetryNotice,
                    isFallback
                        ? this.t('⚠️ Nadal duże obciążenie serwerów Google - próbuję z alternatywnym modelem...')
                        : `${this.t('⚠️ Serwery Google są mocno obciążone - ponawiam próbę')} (${attempt}/${maxAttempts})...`
                )
            });
            progress.finish(this.t("Gotowe!"));
            // Pytania są generowane przez AI za KAŻDYM razem od nowa (zależnie od notatek), więc nie
            // da się ich przetłumaczyć z wyprzedzeniem jak KNOWN_DYNAMIC_STRINGS - tłumaczymy je tu,
            // na żywo, TYLKO do wyświetlenia (oryginalne, polskie pytania trafiają do dataset.question
            // w renderQuestions, bo to one budują interviewAnswers -> prompt generujący artykuł, który
            // MUSI zostać po polsku niezależnie od języka interfejsu).
            const displayQuestions = await this.translateForDisplay(questions);
            this.renderQuestions(questions, displayQuestions);
        } catch (error) {
            progress.stop();
            if (error.name === 'AbortError') return; // użytkownik kliknął "Pomiń" - nic więcej nie rób
            this.renderQuestions([
                `${this.t('Nie udało się połączyć z AI')} (${error.message}). ${this.t('Czy chcesz samodzielnie dodać jakieś kluczowe szczegóły, o których zapomniałeś w notatkach?')}`
            ]);
        } finally {
            this.hideRetryNotice(this.aiRetryNotice);
        }

        this.btnSubmitModal.disabled = false;
    },

    closeModal(saveData) {
        if (saveData) {
            const answers = [];
            this.aiQuestionsContainer.querySelectorAll('.question-answer').forEach(ta => {
                const val = ta.value.trim();
                if (val) {
                    answers.push(`Pytanie: ${ta.dataset.question}\nOdpowiedź: ${val}`);
                }
            });
            this.state.interviewAnswers = answers.join('\n\n');
        } else {
            this.state.interviewAnswers = "";
        }
        this.aiModal.classList.add('hidden');
        this.switchStep('step2');
        this.renderFileList();
    },

    async handleFiles(files) {
        if (!files || files.length === 0) return;
        if (this._processingFiles) return; // ochrona przed nakładającymi się wgraniami
        const incomingFiles = Array.from(files);

        // Walidacja formatu NATYCHMIAST, zanim cokolwiek innego się wydarzy - użytkownik
        // od razu widzi, które pliki są odrzucone i dlaczego.
        const valid = [];
        const rejected = [];
        incomingFiles.forEach(f => {
            if (Compressor.isSupportedFormat(f)) valid.push(f);
            else rejected.push(f.name);
        });

        if (rejected.length > 0) {
            alert(`${this.t('Błędny format pliku - pominięto')} ${rejected.length} ${rejected.length === 1 ? this.t('plik') : this.t('plików')}:\n\n- ${rejected.join('\n- ')}\n\n${this.t('Obsługiwane formaty: JPG, PNG, TIFF, DNG, WEBP, HEIC, HEIF, GIF, AVIF, BMP.')}`);
        }

        if (valid.length === 0) {
            this.fileInput.value = "";
            return;
        }

        const total = valid.length;
        this._processingFiles = true;

        // Błyskawiczny loader: blokujemy przyciski i pokazujemy pasek postępu OD RAZU.
        // Całe dekodowanie i kompresja dzieją się w Web Workerach (js/imageWorker.js),
        // więc główny wątek się nie zawiesza niezależnie od tego, jak ciężki jest plik.
        this.dropzone.classList.add('disabled');
        this.fileInput.disabled = true;
        this.btnGoToStep3.disabled = true;
        this.uploadProgressWrap.classList.remove('hidden');
        this.uploadProgressLabel.classList.remove('hidden');
        this.uploadProgressBar.style.width = '0%';
        this.uploadProgressLabel.textContent = `${this.t('Przygotowywanie')} ${total} ${total === 1 ? this.t('zdjęcia') : this.t('zdjęć')}...`;

        // Wymuszenie natychmiastowego przerysowania strony PRZED zleceniem pracy workerom.
        await new Promise(resolve => requestAnimationFrame(resolve));

        const { eventTitle: title, eventDateStr: startDate } = this.getFileNamingSource();
        const skipped = [];

        const fileProgress = new Array(total).fill(0);
        const updateOverallProgress = () => {
            const sum = fileProgress.reduce((a, b) => a + b, 0);
            const pct = Math.round(sum / total);
            this.uploadProgressBar.style.width = pct + '%';
            this.uploadProgressLabel.textContent = `${this.t('Przetwarzanie')} ${total} ${total === 1 ? this.t('zdjęcia') : this.t('zdjęć')}... (${pct}%)`;
        };

        const tasks = valid.map((file, i) => {
            const nextIndex = Compressor.processedFiles.length + i;
            return Compressor.processImage(file, nextIndex, title, startDate, (stage, pct) => {
                fileProgress[i] = pct;
                updateOverallProgress();
            }).then(res => {
                fileProgress[i] = 100;
                updateOverallProgress();
                return { ok: true, res };
            }).catch(err => {
                console.error(err);
                fileProgress[i] = 100;
                updateOverallProgress();
                return { ok: false, error: err?.message || file.name };
            });
        });

        const results = await Promise.all(tasks);
        results.forEach(r => {
            if (r.ok) Compressor.processedFiles.push(r.res);
            else skipped.push(r.error);
        });

        this.uploadProgressWrap.classList.add('hidden');
        this.uploadProgressLabel.classList.add('hidden');
        this.dropzone.classList.remove('disabled');
        this.fileInput.disabled = false;
        this.fileInput.value = "";
        this._processingFiles = false;
        this.renderFileList();

        if (skipped.length > 0) {
            alert(`${this.t('Nie udało się przetworzyć')} ${skipped.length} ${this.t('z')} ${total} ${this.t('plików')}:\n\n- ${skipped.join('\n- ')}`);
        }
    },

    // Przelicza nazwy WSZYSTKICH plików od nowa: RRRR-MM-{slug}-NR.webp. Źródło roku/miesiąca/slugu
    // zależy od trybu - patrz getFileNamingSource (w automatycznym: slug od AI po Kroku 3, a dopóki
    // AI się nie wypowiedziało - tytuł z Kroku 1; w pół-automatycznym/manualnym: pola z Kroku 2).
    // Zdjęcie oznaczone jako wyróżniające zawsze dostaje numer "00", niezależnie od pozycji na liście;
    // pozostałe zdjęcia są numerowane kolejno 01, 02... (bez wliczania wyróżniającego).
    renameAllFiles() {
        const { eventTitle, eventDateStr } = this.getFileNamingSource();
        const dateObj = new Date(eventDateStr || Date.now());
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const baseSlug = Compressor.sanitizeString(eventTitle);

        let seq = 0;
        Compressor.processedFiles.forEach(file => {
            const numStr = file.isFeatured ? '00' : String(++seq).padStart(2, '0');
            file.name = `${year}-${month}-${baseSlug}-${numStr}.webp`;
            // Bez podkatalogów RRRR/MM - patrz komentarz przy WP_SITE_URL.
            file.wpPath = `${WP_SITE_URL}/wp-content/uploads/${file.name}`;
        });
    },

    // Kliknięcie "Ustaw jako wyróżniające": przenosi zdjęcie na sam początek listy (indeks 0)
    // i oznacza je flagą isFeatured (numeracja "00" nadawana jest w renameAllFiles).
    setFeaturedImage(index) {
        const files = Compressor.processedFiles;
        if (index < 0 || index >= files.length) return;
        files.forEach(f => { f.isFeatured = false; });
        const [item] = files.splice(index, 1);
        item.isFeatured = true;
        files.unshift(item);
        this.renderFileList();
    },

    renderFileList() {
        this.fileStatus.innerHTML = "";

        if (Compressor.processedFiles.length === 0) {
            this.fileStatus.innerHTML = `<p style='text-align:center; padding: 20px; color: var(--text-muted); border: 1px dashed var(--border); border-radius: 6px;'>${this.t('Brak dodanych zdjęć. Przeciągnij pliki wyżej, aby je dodać.')}</p>`;
            this.btnGoToStep3.disabled = true;
            return;
        }

        this.renameAllFiles();

        Compressor.processedFiles.forEach((file, index) => {
            const item = document.createElement('div');
            item.style.cssText = "display: flex; align-items: center; justify-content: space-between; padding: 10px; background: #1c1c22; margin-bottom: 8px; border-radius: 6px; border: 1px solid var(--border); flex-wrap: wrap; gap: 10px;";

            const sizeKB = (file.size/1024).toFixed(1);
            const statusIcon = file.isFeatured ? '⭐' : '✅';
            const ratioInfo = this.getRatioInfo(file);
            const ratioWarning = ratioInfo.known && !ratioInfo.acceptable
                ? `<div style="color: var(--danger); font-size: 0.75rem; margin-top: 2px;">⚠️ ${this.t('Nietypowe proporcje (zalecane 3:2, 2:3 lub pion 4:5)')}</div>`
                : '';
            const featureBtnDisabled = !file.isFeatured && !ratioInfo.featuredEligible;
            const featureBtnTitle = featureBtnDisabled ? ` title="${this.t('Obrazek wyróżniający musi być zdjęciem poziomym w proporcjach 3:2')}"` : '';

            item.innerHTML = `
                <div style="display: flex; align-items: center; gap: 15px;">
                    <img src="${file.previewUrl}" style="width: 55px; height: 55px; object-fit: cover; border-radius: 4px; border: 1px solid #3e3e4a;">
                    <div>
                        <span style="font-weight: 500; color: #fff; display: block;">${statusIcon} ${file.name}</span>
                        <span style="color: var(--text-muted); font-size: 0.8rem;">${this.t('Waga:')} ${sizeKB} KB</span>
                        ${ratioWarning}
                    </div>
                </div>
                <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                    <button class="btn-feature${file.isFeatured ? ' active' : ''}"${featureBtnTitle} ${featureBtnDisabled ? 'disabled' : ''} style="padding: 8px 12px; font-size: 0.85rem; border-radius: 4px; border: none; cursor: pointer;">${file.isFeatured ? '⭐ ' + this.t('Wyróżniające') : '☆ ' + this.t('Ustaw jako wyróżniające')}</button>
                    <button class="btn-up" style="background: #2e2e38; color: #fff; padding: 8px 12px; font-size: 0.85rem; border-radius: 4px; border: none; cursor: pointer;">▲</button>
                    <button class="btn-down" style="background: #2e2e38; color: #fff; padding: 8px 12px; font-size: 0.85rem; border-radius: 4px; border: none; cursor: pointer;">▼</button>
                    <button class="btn-del" style="background: var(--danger); color: white; padding: 8px 12px; font-size: 0.85rem; border-radius: 4px; font-weight: bold; border: none; cursor: pointer;">${this.t('Usuń')}</button>
                </div>
            `;

            item.querySelector('.btn-feature').addEventListener('click', (e) => {
                e.preventDefault();
                if (file.isFeatured) {
                    file.isFeatured = false;
                    this.renderFileList();
                } else if (this.canBeFeatured(file)) {
                    this.setFeaturedImage(index);
                }
            });

            item.querySelector('.btn-up').addEventListener('click', (e) => {
                e.preventDefault();
                if (index > 0) {
                    const temp = Compressor.processedFiles[index];
                    Compressor.processedFiles[index] = Compressor.processedFiles[index - 1];
                    Compressor.processedFiles[index - 1] = temp;
                    this.renderFileList();
                }
            });

            item.querySelector('.btn-down').addEventListener('click', (e) => {
                e.preventDefault();
                if (index < Compressor.processedFiles.length - 1) {
                    const temp = Compressor.processedFiles[index];
                    Compressor.processedFiles[index] = Compressor.processedFiles[index + 1];
                    Compressor.processedFiles[index + 1] = temp;
                    this.renderFileList();
                }
            });

            item.querySelector('.btn-del').addEventListener('click', (e) => {
                e.preventDefault();
                const [removed] = Compressor.processedFiles.splice(index, 1);
                if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
                this.renderFileList();
            });

            this.fileStatus.appendChild(item);
        });

        this.btnGoToStep3.disabled = false;
    },

    goToStep3() {
        // Jeśli użytkownik nie wybrał ręcznie obrazka wyróżniającego, wybieramy losowy (pkt "Obrazek wyróżniający").
        this.ensureFeaturedImage();

        const cat = this.evtCategory.value;
        let compiledInformation = "";

        if (cat === 'kultura' || cat === 'sport' || cat === 'nauka') {
            compiledInformation += `Wydarzenie: ${this.evtTitle.value}\n`;
            compiledInformation += `Miejsce: ${this.evtLocation.value}\n`;
            compiledInformation += `Czas: od ${this.evtStart.value} do ${this.evtEnd.value}\n\n`;
        }

        compiledInformation += `Główne notatki autora:\n${this.evtNotes.value}\n`;

        if (this.state.interviewAnswers) {
            compiledInformation += `\nDodatkowe szczegóły uzyskane z wywiadu z AI:\n${this.state.interviewAnswers}`;
        }

        const externalArticle = this.evtExternalArticle?.value.trim();
        if (externalArticle) {
            compiledInformation += `\n\n=== ZEWNĘTRZNY ARTYKUŁ O TYM WYDARZENIU (TYLKO DO INSPIRACJI FAKTOGRAFICZNEJ - NIE KOPIUJ ZDAŃ ANI STYLU) ===\n${externalArticle}`;
        }

        this.finalNotes.value = compiledInformation;
        this.switchStep('step3');
    },

    // Odpowiednik goToStep3() dla trybu pół-automatycznego - bez kompilowania notatek dla AI
    // (autor pisze treść sam), tylko proste przejście do kroku pisania.
    goToSemiWriteStep() {
        this.switchStep('semiWriteStep');
    },

    // Dokłada jedną "karteczkę" z polem na URL i jego opis (Krok 3) - dzięki temu autor może
    // dodać dowolną liczbę linków, każdy z osobnym opisem, na podstawie którego AI decyduje,
    // czy pokazać go jako przycisk-galerię, czy wpleść naturalnie w treść (patrz gemini.js).
    addLinkRow(url = '', description = '') {
        const row = document.createElement('div');
        row.className = 'link-row';
        row.innerHTML = `
            <input type="url" class="link-url-input" placeholder="np. https://drive.google.com/... albo https://facebook.com/...">
            <input type="text" class="link-desc-input" placeholder="Opisz krótko ten link - AI samo zdecyduje, czy pokazać go jako przycisk (np. galeria zdjęć w chmurze), czy wpleść w treść.">
            <button type="button" class="btn-remove-link" aria-label="Usuń ten link" title="Usuń ten link">✕</button>
        `;
        row.querySelector('.link-url-input').value = url;
        row.querySelector('.link-desc-input').value = description;
        row.querySelector('.btn-remove-link').addEventListener('click', () => row.remove());
        this.linkRowsContainer.appendChild(row);
    },

    // Usuwa wszystkie "karteczki" linków i dokłada jedną, pustą - stan startowy formularza.
    resetLinkRows() {
        this.linkRowsContainer.innerHTML = '';
        this.addLinkRow();
    },

    // Zbiera wszystkie wypełnione linki (te bez adresu URL są pomijane - pusta karteczka to
    // po prostu brak zamiaru dodania linku, nie błąd).
    getArticleLinks() {
        return Array.from(this.linkRowsContainer.querySelectorAll('.link-row'))
            .map(row => ({
                url: row.querySelector('.link-url-input').value.trim(),
                description: row.querySelector('.link-desc-input').value.trim()
            }))
            .filter(link => link.url);
    },

    // Czy jest cokolwiek do stracenia w obecnym stanie formularza - wspólne dla "Generuj kolejny
    // wpis" (startNewPost) i zmiany trybu pracy (switchMode), bo obie akcje czyszczą WSZYSTKO.
    hasUnsavedContent() {
        return !!(this.evtTitle.value || this.evtNotes.value || this.semiTitleInput.value
            || this.semiArticleInput.value || this.getArticleLinks().length > 0
            || Compressor.processedFiles.length > 0 || this.state.aiData);
    },

    // Czyści pola WSZYSTKICH trybów i przerywa ewentualne trwające żądania do AI - wydzielone z
    // dawnego startNewPost, żeby ta sama logika reużyła się też przy zmianie trybu pracy (switchMode),
    // gdzie struktura kroków jest inna, więc dalsza nawigacja różni się od "Generuj kolejny wpis".
    resetAllFormState() {
        this._articleAbortController?.abort();
        this._interviewAbortController?.abort();
        this._semiAbortController?.abort();

        // Krok 1 (tryb automatyczny)
        this.evtCategory.value = '';
        this.handleCategoryChange();
        this.evtTitle.value = '';
        this.evtLocation.value = '';
        this.evtStart.value = '';
        this.evtEnd.value = '';
        this.evtNotes.value = '';
        this.evtExternalArticle.value = '';

        // Pola nazywania plików (tryby pół-automatyczny/manualny)
        this.fileNameMonth.value = '';
        this.fileNameEventName.value = '';
        this.updateFileNamePreview();

        // Krok pisania (tryb pół-automatyczny)
        this.semiTitleInput.value = '';
        this.semiTagsInput.value = '';
        this.semiArticleInput.value = '';

        // Zdjęcia - zwalniamy podglądy (previewUrl), żeby nie zostawić wycieku pamięci
        Compressor.processedFiles.forEach(f => { if (f.previewUrl) URL.revokeObjectURL(f.previewUrl); });
        Compressor.processedFiles = [];
        this.fileInput.value = '';
        this.renderFileList();

        // Wynik AI - współdzielony między tryb automatyczny i pół-automatyczny
        this.finalNotes.value = '';
        this.resetLinkRows();
        this.state.interviewAnswers = '';
        this.state.aiFilenameSlug = null;
        this.state.aiData = null;
        this.sugTitleInput.value = '';
        this.sugTagsInput.value = '';
        this.sugDate.innerText = '-';
        this.metaDateItem.classList.remove('hidden');
        this.sugFeaturedImage.textContent = '-';
        this.articleTextInput.value = '';
        this.gutenbergOutput.value = '';
        this.setResultState('empty');
        this.switchOutputTab('text');
    },

    // Pełny reset formularza i powrót do pierwszego kroku AKTUALNEGO trybu - pozwala napisać
    // kolejny wpis bez ręcznego czyszczenia każdego pola z osobna. Pyta o potwierdzenie tylko,
    // gdy faktycznie jest coś do stracenia (świeży formularz nie musi straszyć niepotrzebnym oknem).
    startNewPost() {
        if (this.hasUnsavedContent() && !window.confirm(this.t('Czy na pewno chcesz zacząć nowy wpis? Obecne dane, zdjęcia i wygenerowana treść zostaną utracone.'))) {
            return;
        }
        this.resetAllFormState();
        this.switchStep({ auto: 'step1', semi: 'step2', manual: 'step2' }[this.state.mode]);
        this.showToast(this.t('Możesz zacząć pisać nowy wpis!'));
    },

    // Zmiana trybu pracy z górnego przełącznika - struktura kroków różni się między trybami
    // (pola do wypełnienia są zupełnie inne), więc tak jak "Generuj kolejny wpis" wymaga pełnego
    // resetu formularza; pyta o potwierdzenie tylko, gdy jest coś do stracenia.
    switchMode(newMode) {
        if (newMode === this.state.mode) return;

        if (this.hasUnsavedContent() && !window.confirm(this.t('Zmiana trybu pracy zresetuje formularz - obecne dane, zdjęcia i wygenerowana treść zostaną utracone. Kontynuować?'))) {
            this.modeSwitcher.value = this.state.mode; // cofnij wizualną zmianę w <select>
            return;
        }

        this.resetAllFormState();
        this.state.mode = newMode;
        this.applyModeUI();
    },

    // Dostosowuje CAŁY interfejs do aktualnego trybu: widoczność kroków na pasku postępu, pola
    // Kroku 2 (nazywanie plików / instrukcja manualna) i miejsce współdzielonych bloków (pole na
    // linki, wynik AI, meta-dane, karta pobierania zdjęć - patrz repositionSharedBlocks), a na
    // koniec przechodzi do pierwszego kroku nowo wybranego trybu.
    applyModeUI() {
        this.updateStepsIndicatorForMode();
        this.updateStep2FieldsForMode();
        this.repositionSharedBlocks();
        this.switchStep({ auto: 'step1', semi: 'step2', manual: 'step2' }[this.state.mode]);
    },

    updateStepsIndicatorForMode() {
        document.querySelectorAll('.steps-indicator .step').forEach(el => {
            el.classList.toggle('hidden', el.dataset.modes !== this.state.mode);
        });
    },

    updateStep2FieldsForMode() {
        const mode = this.state.mode;
        this.step2IntroAuto.classList.toggle('hidden', mode !== 'auto');
        this.step2IntroOther.classList.toggle('hidden', mode === 'auto');
        this.fileNamingFields.classList.toggle('hidden', mode === 'auto');
        this.manualInstructions.classList.toggle('hidden', mode !== 'manual');
        this.btnBackToStep1.classList.toggle('hidden', mode !== 'auto');
        this.downloadCtaTextAuto.classList.toggle('hidden', mode !== 'auto');
        this.downloadCtaTextOther.classList.toggle('hidden', mode === 'auto');

        if (mode === 'manual') {
            this.btnGoToStep3.classList.add('hidden');
        } else {
            this.btnGoToStep3.classList.remove('hidden');
            this.btnGoToStep3.textContent = mode === 'semi' ? 'Dalej: Pisz artykuł →' : 'Dalej: Generuj Wpis →';
        }
    },

    // Krok 3 (auto) i Krok pisania (pół-auto) dzielą TĘ SAMĄ logikę wyniku (setResultState,
    // renderTextView, kod Gutenberga, meta-dane, kopiowanie, pole na linki) - zamiast duplikować
    // ten interfejs w dwóch miejscach, te same węzły DOM są PRZENOSZONE do właściwego miejsca w
    // zależności od trybu. Dzięki temu chowają/pokazują się automatycznie razem z sekcją-rodzicem
    // (patrz switchStep - .step-section bez klasy "active" ma display:none).
    repositionSharedBlocks() {
        if (this.state.mode === 'semi') {
            this.semiArticleInput.insertAdjacentElement('afterend', this.linkInputGroup);
            this.semiGrid.appendChild(this.resultZone);
            this.semiGrid.insertAdjacentElement('afterend', this.aiActionsFooter);
            this.semiGrid.insertAdjacentElement('afterend', this.metaSuggestion);
        } else if (this.state.mode === 'auto') {
            this.finalNotes.insertAdjacentElement('afterend', this.linkInputGroup);
            this.step3Grid.appendChild(this.resultZone);
            this.step3Grid.insertAdjacentElement('afterend', this.aiActionsFooter);
            this.step3Grid.insertAdjacentElement('afterend', this.metaSuggestion);
            this.aiActionsFooter.insertAdjacentElement('afterend', this.downloadPhotosCta);
        }
        // Tryb manualny nie używa linku/wyniku/meta-danych wcale - zostają tam, gdzie akurat są
        // (ukryte razem z sekcją-rodzicem), a karta pobierania idzie do Kroku 2 (patrz niżej).

        if (this.state.mode !== 'auto') {
            this.fileStatus.insertAdjacentElement('afterend', this.downloadPhotosCta);
        }
    },

    // Podgląd nazwy pliku na żywo (tryby pół-automatyczny/manualny) - używa TEJ SAMEJ funkcji
    // sanityzującej co docelowe nazywanie plików (Compressor.sanitizeString), więc podgląd zawsze
    // dokładnie zgadza się z tym, co faktycznie trafi do nazwy pliku.
    updateFileNamePreview() {
        const monthVal = this.fileNameMonth.value; // format "RRRR-MM" albo pusty string
        const dateObj = new Date(monthVal ? `${monthVal}-01` : Date.now());
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const slug = Compressor.sanitizeString(this.fileNameEventName.value || 'wydarzenie');
        this.fileNamePreview.innerHTML = `Podgląd nazwy pliku: <strong>${year}-${month}-${slug}-01.webp</strong>`;
    },

    // Źródło danych do nazywania plików/folderu zależy od trybu: w automatycznym to nazwa
    // wydarzenia z Kroku 1 (ew. nadpisana slugiem od AI po wygenerowaniu) + data rozpoczęcia;
    // w pół-automatycznym/manualnym to pola wpisane wprost w Kroku 2 (miesiąc+rok+nazwa).
    getFileNamingSource() {
        if (this.state.mode === 'auto') {
            return {
                eventTitle: this.state.aiFilenameSlug || this.evtTitle?.value || 'saf-wpis',
                eventDateStr: this.evtStart.value
            };
        }
        return {
            eventTitle: this.fileNameEventName.value || 'wydarzenie',
            eventDateStr: this.fileNameMonth.value ? `${this.fileNameMonth.value}-01` : ''
        };
    },

    // Usuwa znaczniki <strong>/<em>, których AI używa w treści akapitów (patrz gemini.js) - w
    // "czystym" widoku tekstu mają być całkowicie niewidoczne, zostają tylko w kodzie Gutenberga.
    stripFormattingTags(text) {
        return (text || '').replace(/<\/?(strong|em)>/gi, '');
    },

    // Serializuje jeden wiersz tabeli do czytelnej postaci "| komórka | komórka |" w widoku tekstu.
    formatTableRow(cells) {
        return '| ' + (cells || []).map(c => String(c ?? '').replace(/\|/g, '/').trim()).join(' | ') + ' |';
    },

    // Odwrotność formatTableRow - rozbija "| a | b |" z powrotem na tablicę komórek.
    parseTableRow(line) {
        return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
    },

    // Scala lead + akapity (w tym ewentualne tabele i przyciski-linki) w JEDNO pole tekstowe: bloki
    // oddzielone pustą linią, opcjonalny śródtytuł jako pierwsza linia bloku w formie "## Śródtytuł".
    // Prosty, czytelny format, który użytkownik może dowolnie edytować (dopisać/usunąć/poprawić
    // całe akapity, wiersze tabeli czy same przyciski - nie tylko pojedyncze słowa).
    buildArticleText(aiData) {
        const blocks = [this.stripFormattingTags(aiData.lead)];
        (aiData.paragraphs || []).forEach((para) => {
            const headingLine = para.heading ? `## ${para.heading}\n` : '';
            if (para.type === 'table' && Array.isArray(para.rows)) {
                blocks.push(headingLine + para.rows.map(row => this.formatTableRow(row)).join('\n'));
            } else {
                blocks.push(headingLine + this.stripFormattingTags(para.text));
            }
        });
        (aiData.linkButtons || []).forEach((btn) => {
            if (btn && btn.url) blocks.push(`[PRZYCISK: ${btn.label || 'Zobacz więcej'} -> ${btn.url}]`);
        });
        return blocks.join('\n\n');
    },

    // Odwrotność buildArticleText: rozdziela tekst z powrotem na lead + akapity (w tym tabele
    // i przyciski-linki) po pustych liniach.
    parseArticleText(text) {
        const blocks = (text || '').split(/\n\s*\n/).map(b => b.trim()).filter(b => b.length > 0);
        const lead = blocks.shift() || '';

        // Przyciski-linki, jeśli obecne, są ZAWSZE ostatnimi blokami (patrz buildArticleText) -
        // użytkownik może dowolnie poprawić etykietę/adres albo usunąć całą linię, by je wyłączyć.
        const linkButtons = [];
        while (blocks.length) {
            const btnMatch = blocks[blocks.length - 1].match(/^\[PRZYCISK:\s*(.+?)\s*->\s*(\S+)\]$/i);
            if (!btnMatch) break;
            linkButtons.unshift({ label: btnMatch[1].trim(), url: btnMatch[2].trim() });
            blocks.pop();
        }

        const paragraphs = blocks.map((block) => {
            const lines = block.split('\n');
            let heading = '';
            let bodyLines = lines;
            if (lines[0] && lines[0].trim().startsWith('## ')) {
                heading = lines[0].trim().slice(3).trim();
                bodyLines = lines.slice(1);
            }

            const nonEmptyLines = bodyLines.filter(l => l.trim().length > 0);
            const isTable = nonEmptyLines.length > 0 && nonEmptyLines.every(l => l.trim().startsWith('|'));
            if (isTable) {
                return { type: 'table', heading, rows: nonEmptyLines.map(l => this.parseTableRow(l)) };
            }
            return { type: 'text', heading, text: bodyLines.join('\n').trim() };
        });

        return { lead, paragraphs, linkButtons };
    },

    // Wypełnia edytowalny "widok tekstu" jednym polem, złożonym z leadu, akapitów, ewentualnych
    // tabel i przycisku-linku - CELOWO bez znaczników HTML i bez zdjęć, żeby dało się swobodnie
    // dopisać, usunąć lub poprawić treść przed skopiowaniem (formatowanie i zdjęcia widać
    // wyłącznie w kodzie Gutenberga).
    renderTextView(aiData) {
        this.articleTextInput.value = this.buildArticleText(aiData);
    },

    // Czyta edytowalny tekst z powrotem do this.state.aiData, żeby dało się z niego zregenerować
    // kod Gutenberga. Akapity TEKSTOWE, których użytkownik NIE dotknął (tekst identyczny jak
    // poprzednio, po odjęciu <strong>/<em>), zachowują oryginalne znaczniki AI - tracą je tylko te
    // faktycznie zmienione (bo nie ma jak zgadnąć, gdzie w przepisanym zdaniu miałoby wrócić
    // pogrubienie). Tabele nie niosą żadnego formatowania HTML, więc ich dane bierzemy zawsze 1:1.
    syncTextViewToAiData() {
        if (!this.state.aiData) return;
        const parsed = this.parseArticleText(this.articleTextInput.value);

        const prevLeadPlain = this.stripFormattingTags(this.state.aiData.lead);
        this.state.aiData.lead = (parsed.lead === prevLeadPlain) ? this.state.aiData.lead : parsed.lead;

        const prevParagraphs = this.state.aiData.paragraphs || [];
        this.state.aiData.paragraphs = parsed.paragraphs.map((para, idx) => {
            if (para.type === 'table') return para;

            const prev = prevParagraphs[idx];
            if (!prev || prev.type === 'table') return para; // nowy akapit albo tabela podmieniona na tekst

            const headingUnchanged = para.heading === (prev.heading || '');
            const textUnchanged = para.text === this.stripFormattingTags(prev.text);
            return {
                type: 'text',
                heading: headingUnchanged ? prev.heading : para.heading,
                text: textUnchanged ? prev.text : para.text
            };
        });

        this.state.aiData.linkButtons = parsed.linkButtons;
    },

    regenerateGutenbergCode() {
        if (!this.state.aiData) return;
        this.gutenbergOutput.value = Gutenberg.generateBlockCode(this.state.aiData, Compressor.processedFiles);
    },

    // Przełącznik "Tekst artykułu" / "Kod Gutenberga". Przy przejściu na kod NAJPIERW zapisujemy
    // ewentualne edycje tekstu i dopiero potem odświeżamy kod - dzięki temu poprawki zrobione
    // w widoku tekstu zawsze trafiają do finalnego kodu do wklejenia w WordPressie.
    switchOutputTab(tab) {
        if (tab === 'code') {
            this.syncTextViewToAiData();
            this.regenerateGutenbergCode();
        }
        this.tabTextView.classList.toggle('active', tab === 'text');
        this.tabCodeView.classList.toggle('active', tab === 'code');
        this.textViewPanel.classList.toggle('hidden', tab !== 'text');
        this.codeViewPanel.classList.toggle('hidden', tab !== 'code');
    },

    // Krok 3 może pokazywać dokładnie jeden z czterech stanów w prawej kolumnie ("pusto" przed
    // generowaniem / ładowanie / błąd / gotowy wynik) - meta-dane (tytuł/tagi/data/wyróżniające)
    // i stopka z instrukcjami+akcjami są POZA siatką 2-kolumnową (patrz index.html), ale wizualnie
    // należą do stanu "gotowy wynik", więc przełączają się razem z resztą przez tę jedną metodę.
    setResultState(mode) {
        this.aiEmptyState.classList.toggle('hidden', mode !== 'empty');
        this.aiLoading.classList.toggle('hidden', mode !== 'loading');
        this.aiFallback.classList.toggle('hidden', mode !== 'fallback');
        this.aiOutput.classList.toggle('hidden', mode !== 'output');
        this.metaSuggestion.classList.toggle('hidden', mode !== 'output');
        this.aiActionsFooter.classList.toggle('hidden', mode !== 'output');
    },

    async generateArticle() {
        this.setResultState('loading');

        this._articleAbortController = new AbortController();
        const { signal } = this._articleAbortController;

        const progress = this.startProgressSimulation(
            this.genProgressBar,
            this.genProgressLabel,
            [],
            [
                this.t("Analizuję notatki..."),
                this.t("Redaguję tytuł i lead..."),
                this.t("Piszę treść artykułu..."),
                this.t("Dobieram tagi..."),
                this.t("Formatuję kod dla WordPressa...")
            ],
            11000
        );

        const cat = this.evtCategory.value;
        const notes = this.finalNotes.value;
        const links = this.getArticleLinks();
        const prompt = Gemini.getPromptTemplate(cat, notes, links);

        try {
            const aiJson = await Gemini.callGemini(prompt, {
                signal,
                onRetry: (attempt, maxAttempts, isFallback) => this.showRetryNotice(
                    this.genRetryNotice,
                    isFallback
                        ? this.t('⚠️ Nadal duże obciążenie serwerów Google - próbuję z alternatywnym modelem...')
                        : `${this.t('⚠️ Serwery Google są mocno obciążone - ponawiam próbę')} (${attempt}/${maxAttempts})...`
                )
            });
            progress.finish(this.t("Gotowe!"));

            const endVal = this.evtEnd.value;
            let pubDate = new Date();
            if (endVal && this.evtCategory.value !== 'zapowiedzi') {
                pubDate = new Date(endVal);
                pubDate.setHours(pubDate.getHours() + 3);
            }

            this.sugTitleInput.value = aiJson.title || '';
            this.metaDateItem.classList.remove('hidden');
            this.sugDate.innerText = pubDate.toLocaleString('pl-PL');
            // Pkt "łatwe kopiowanie tagów": każdy tag zakończony przecinkiem, gotowy do wklejenia w WordPressie.
            this.sugTagsInput.value = aiJson.tags && aiJson.tags.length ? aiJson.tags.map(t => `${t},`).join(' ') : '';

            // AI decyduje o czytelnej nazwie bazowej plików (pkt "Nazwy plików WebP generowane przez AI") -
            // przemianowujemy wszystkie zdjęcia PRZED wygenerowaniem kodu Gutenberga, żeby ścieżki się zgadzały.
            if (aiJson.filenameSlug || aiJson.title) {
                this.state.aiFilenameSlug = aiJson.filenameSlug || aiJson.title;
                this.renameAllFiles();
            }

            const featured = Compressor.processedFiles.find(f => f.isFeatured);
            this.sugFeaturedImage.textContent = featured ? featured.name : 'brak';

            this.state.aiData = aiJson;
            this.renderTextView(aiJson);
            this.switchOutputTab('code'); // domyślnie pokazujemy gotowy kod Gutenberga (regeneruje się przy przełączeniu)

            this.setResultState('output');
        } catch (error) {
            progress.stop();
            if (error.name === 'AbortError') return; // użytkownik wyszedł z Kroku 3 w trakcie generowania
            // Fallback: nazwy zdjęć już bazują na tytule z Kroku 1 (patrz renameAllFiles - aiFilenameSlug
            // jest wtedy dalej puste), więc nic tu nie trzeba dodatkowo naprawiać. Użytkownik dostaje
            // za to gotowy, samowystarczalny prompt do wklejenia w dowolnym zewnętrznym czacie AI
            // (patrz copyExternalPrompt - liczony na nowo z aktualnego stanu formularza, a nie z
            // zapamiętanej zmiennej, więc działa niezależnie od tego, co się stało z tym wywołaniem).
            this.aiFallbackMessage.textContent = `${this.t('Nie udało się połączyć z wbudowanym AI')} (${error.message}). ${this.t('Zdjęcia zachowały nazwy na podstawie nazwy wydarzenia z Kroku 1. Możesz skopiować kompletny prompt poniżej i wkleić go do dowolnego zewnętrznego czatu AI (np. ChatGPT, Claude, Gemini) - wynik będzie odpowiadał temu, co wygenerowałby Redaktor SAF.')}`;
            this.setResultState('fallback');
        } finally {
            this.hideRetryNotice(this.genRetryNotice);
        }
    },

    // Pkt 5: korzystamy z asynchronicznego Clipboard API zamiast select()+execCommand,
    // co dodatkowo ogranicza ryzyko dziwnych "heurystyk" przeglądarki przy kopiowaniu.
    async copyGutenbergCode() {
        // Niezależnie od tego, na której zakładce akurat jest użytkownik - kopiujemy zawsze
        // NAJŚWIEŻSZY kod, uwzględniający ewentualne poprawki wprowadzone w widoku tekstu.
        this.syncTextViewToAiData();
        this.regenerateGutenbergCode();

        const text = this.gutenbergOutput.value;
        try {
            await navigator.clipboard.writeText(text);
        } catch (e) {
            this.gutenbergOutput.select();
            document.execCommand('copy');
        }
        this.showToast(this.t('Skopiowano do schowka!'));
    },

    // Pkt 6: osobny przycisk kopiujący sam tytuł wpisu
    async copyTitle() {
        const text = this.sugTitleInput.value;
        try {
            await navigator.clipboard.writeText(text);
        } catch (e) {
            this.sugTitleInput.select();
            document.execCommand('copy');
        }
        this.showToast(this.t('Skopiowano do schowka!'));
    },

    // Osobny przycisk kopiujący tagi (każdy zakończony przecinkiem - gotowe do wklejenia w WordPressie)
    async copyTags() {
        const text = this.sugTagsInput.value;
        try {
            await navigator.clipboard.writeText(text);
        } catch (e) {
            this.sugTagsInput.select();
            document.execCommand('copy');
        }
        this.showToast(this.t('Skopiowano do schowka!'));
    },

    // Buduje TEN SAM prompt, który poszedłby do wbudowanego AI (pełne generowanie w trybie auto,
    // albo formatowanie/poprawki w trybie pół-auto), żeby wynik z zewnętrznego czatu AI (ChatGPT,
    // Claude, inny Gemini...) był jak najbardziej zbliżony. Liczony NA NOWO z aktualnego stanu
    // formularza przy KAŻDYM kliknięciu - działa więc NIEZALEŻNIE od tego, czy wbudowane AI w ogóle
    // zostało uruchomione, powiodło się, czy "całkowicie trafiło szlag" (patrz wymóg użytkownika).
    buildExternalPromptText() {
        let prompt;
        if (this.state.mode === 'semi') {
            const parsed = this.parseArticleText(this.semiArticleInput.value);
            prompt = Gemini.polishPromptTemplate(parsed);
        } else {
            const cat = this.evtCategory.value;
            const notes = this.finalNotes.value;
            const links = this.getArticleLinks();
            prompt = Gemini.getPromptTemplate(cat, notes, links);
        }

        // Zdjęcia mają już OSTATECZNE, deterministyczne adresy WordPressa (patrz renameAllFiles) -
        // zewnętrzne AI nie zna naszego systemu wklejania zdjęć, więc dajemy mu gotową listę
        // linków wraz z instrukcją, jak samodzielnie wstawić je w treść.
        this.renameAllFiles();
        const images = Compressor.processedFiles.filter(f => !f.isFeatured);
        if (images.length > 0) {
            const list = images.map(f => `- ${f.wpPath}`).join('\n');
            prompt += `\n\n=== ZDJĘCIA DO WSTAWIENIA W ARTYKULE ===\nPoniższe zdjęcia są już wgrane na serwer pod tymi adresami. Wstaw KAŻDE z nich jako zwykły znacznik HTML <img src="..."> w odpowiednim, pasującym miejscu treści, rozkładając je w miarę równomiernie pomiędzy akapitami (nie wszystkie na początku):\n${list}`;
        }

        return prompt;
    },

    async copyExternalPrompt() {
        const text = this.buildExternalPromptText();
        try {
            await navigator.clipboard.writeText(text);
        } catch (e) {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
        }
        this.showToast(this.t('Skopiowano do schowka!'));
    },

    // Tryb pół-automatyczny: przycisk "AI zasugeruj" dla tytułu, na podstawie już napisanej treści.
    async suggestSemiTitle() {
        const articleText = this.semiArticleInput.value.trim();
        if (!articleText) {
            alert(this.t('Najpierw napisz treść artykułu, żeby AI mogło zaproponować tytuł.'));
            return;
        }
        this.btnSuggestTitle.disabled = true;
        try {
            const title = await Gemini.suggestTitle(articleText);
            if (title) this.semiTitleInput.value = title;
        } catch (error) {
            alert(this.t('Nie udało się zaproponować tytułu:') + ' ' + error.message);
        } finally {
            this.btnSuggestTitle.disabled = false;
        }
    },

    async suggestSemiTags() {
        const articleText = this.semiArticleInput.value.trim();
        if (!articleText) {
            alert(this.t('Najpierw napisz treść artykułu, żeby AI mogło zaproponować tagi.'));
            return;
        }
        this.btnSuggestTags.disabled = true;
        try {
            const tags = await Gemini.suggestTags(this.semiCategory.value, articleText);
            if (tags.length) this.semiTagsInput.value = tags.join(', ');
        } catch (error) {
            alert(this.t('Nie udało się zaproponować tagów:') + ' ' + error.message);
        } finally {
            this.btnSuggestTags.disabled = false;
        }
    },

    // Tryb pół-automatyczny: odpowiednik generateArticle() - autor już napisał tytuł/treść/tagi
    // sam, więc AI dostaje TYLKO postrukturyzowany tekst (patrz Gemini.polishArticleText) do
    // kosmetycznej korekty, bez zmiany treści. Reużywa CAŁĄ resztę infrastruktury wyniku z Kroku 3
    // (setResultState, renderTextView, kod Gutenberga, meta-dane, retry/fallback modelu).
    async convertSemiArticle() {
        const title = this.semiTitleInput.value.trim();
        const articleRaw = this.semiArticleInput.value.trim();
        if (!title) {
            alert(this.t('Wpisz tytuł wpisu (albo kliknij "AI zasugeruj").'));
            return;
        }
        if (!articleRaw) {
            alert(this.t('Napisz treść artykułu, zanim spróbujesz go przekonwertować.'));
            return;
        }

        // Pkt 7: tania kontrola kompletności PRZED właściwą konwersją - jeśli AI uzna tekst za
        // kompletny (albo kontrola się nie powiedzie z jakiegokolwiek powodu - fail-open, nie
        // blokujemy użytkownika), od razu przechodzimy do runSemiConversion.
        this.btnConvertSemi.disabled = true;
        let suggestions = [];
        try {
            suggestions = await Gemini.checkArticleCompleteness(articleRaw);
        } catch (error) {
            console.warn('[Porady] Nie udało się sprawdzić kompletności tekstu:', error.message);
        }
        this.btnConvertSemi.disabled = false;

        if (suggestions.length > 0) {
            this._pendingSemiConversion = { title, articleRaw };
            this.semiAdviceList.innerHTML = suggestions.map(s => `<li>${s}</li>`).join('');
            this.semiAdviceModal.classList.remove('hidden');
            return;
        }

        this.runSemiConversion(title, articleRaw);
    },

    // Dzisiejsza właściwa konwersja (retry/fallback, polishArticleText, budowa aiData) - wydzielona
    // z convertSemiArticle, żeby dało się ją uruchomić dopiero PO ewentualnym potwierdzeniu porad
    // (przycisk "Ignoruj porady i konwertuj") albo od razu, gdy AI nie miało żadnych uwag.
    async runSemiConversion(title, articleRaw) {
        this.setResultState('loading');

        this._semiAbortController = new AbortController();
        const { signal } = this._semiAbortController;

        const progress = this.startProgressSimulation(
            this.genProgressBar,
            this.genProgressLabel,
            [],
            [
                this.t("Sprawdzam pisownię i literówki..."),
                this.t("Dobieram pogrubienia i kursywę..."),
                this.t("Formatuję kod dla WordPressa...")
            ],
            8000
        );

        const parsed = this.parseArticleText(articleRaw);

        try {
            const polished = await Gemini.polishArticleText(parsed, {
                signal,
                onRetry: (attempt, maxAttempts, isFallback) => this.showRetryNotice(
                    this.genRetryNotice,
                    isFallback
                        ? this.t('⚠️ Nadal duże obciążenie serwerów Google - próbuję z alternatywnym modelem...')
                        : `${this.t('⚠️ Serwery Google są mocno obciążone - ponawiam próbę')} (${attempt}/${maxAttempts})...`
                )
            });
            progress.finish(this.t('Gotowe!'));

            const tags = this.semiTagsInput.value.split(',').map(t => t.trim()).filter(Boolean);

            this.sugTitleInput.value = title;
            // Tryb pół-automatyczny nie zna prawdziwej daty publikacji (użytkownik jej nie podał) -
            // w przeciwieństwie do trybu auto NIE zmyślamy jej, tylko chowamy ten wiersz (pkt 4).
            this.metaDateItem.classList.add('hidden');
            this.sugTagsInput.value = tags.length ? tags.map(t => `${t},`).join(' ') : '';

            const featured = Compressor.processedFiles.find(f => f.isFeatured);
            this.sugFeaturedImage.textContent = featured ? featured.name : 'brak';

            this.state.aiData = {
                title,
                lead: polished.lead,
                paragraphs: polished.paragraphs,
                linkButtons: parsed.linkButtons,
                tags,
                filenameSlug: null // nazwy plików w tym trybie pochodzą z pól Kroku 2, nie od AI
            };
            this.renderTextView(this.state.aiData);
            this.switchOutputTab('code'); // domyślnie pokazujemy gotowy kod Gutenberga

            this.setResultState('output');
        } catch (error) {
            progress.stop();
            if (error.name === 'AbortError') return;
            this.aiFallbackMessage.textContent = `${this.t('Nie udało się połączyć z wbudowanym AI')} (${error.message}). ${this.t('Możesz skopiować kompletny prompt poniżej i wkleić go do dowolnego zewnętrznego czatu AI - poprosi go o to samo (poprawki literówek i pogrubienia), co próbowało zrobić wbudowane AI.')}`;
            this.setResultState('fallback');
        } finally {
            this.hideRetryNotice(this.genRetryNotice);
        }
    }
};

window.addEventListener('DOMContentLoaded', () => App.init());