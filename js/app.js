import { Compressor } from './compressor.js';
import { Gemini } from './gemini.js';
import { Gutenberg } from './gutenberg.js';

// Domena WordPressa - w ustawieniach Mediów odznaczone jest "Porządkuj wysyłane pliki w
// katalogi z numerami miesięcy i lat", więc pliki trafiają bezpośrednio do /wp-content/uploads/
// bez podkatalogów RRRR/MM (patrz renameAllFiles).
const WP_SITE_URL = "https://jamnik.uwm.edu.pl";

// Obrazek wyróżniający MUSI być poziomym zdjęciem w proporcjach 3:2 (wymóg WordPressa/stylu strony).
// Tolerancja pokrywa drobne niedokładności edytorów zdjęć (np. 3005x2000 zamiast idealnego 3000x2000).
const FEATURED_RATIO_TARGET = 3 / 2;
const RATIO_TOLERANCE = 0.03;

const App = {
    state: {
        currentStep: 1,
        interviewAnswers: "",
        aiFilenameSlug: null
    },

    init() {
        this.cacheDOM();
        this.bindEvents();
        this.handleCategoryChange();
        this.switchStep(1);
        if (!localStorage.getItem('saf_intro_seen')) {
            this.introModal.classList.remove('hidden');
        }
    },

    cacheDOM() {
        this.logoHome = document.getElementById('logoHome');

        this.btnShowIntro = document.getElementById('btnShowIntro');
        this.introModal = document.getElementById('introModal');
        this.btnCloseIntro = document.getElementById('btnCloseIntro');

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
        this.btnTriggerAI = document.getElementById('btnTriggerAI');
        this.btnCopyHtml = document.getElementById('btnCopyHtml');
        this.btnCopyTitle = document.getElementById('btnCopyTitle');
        this.btnRegenerate = document.getElementById('btnRegenerate');

        this.aiModal = document.getElementById('aiModal');
        this.aiProgressWrap = document.getElementById('aiProgressWrap');
        this.aiProgressBar = document.getElementById('aiProgressBar');
        this.aiProgressLabel = document.getElementById('aiProgressLabel');
        this.aiQuestionsContainer = document.getElementById('aiQuestionsContainer');
        this.btnSkipModal = document.getElementById('btnSkipModal');
        this.btnSubmitModal = document.getElementById('btnSubmitModal');

        this.finalNotes = document.getElementById('finalNotes');
        this.aiLoading = document.getElementById('aiLoading');
        this.genProgressBar = document.getElementById('genProgressBar');
        this.genProgressLabel = document.getElementById('genProgressLabel');
        this.aiFallback = document.getElementById('aiFallback');
        this.aiFallbackMessage = document.getElementById('aiFallbackMessage');
        this.btnCopyFallbackPrompt = document.getElementById('btnCopyFallbackPrompt');
        this.aiOutput = document.getElementById('aiOutput');
        this.gutenbergOutput = document.getElementById('gutenbergOutput');
        this.sugTitleInput = document.getElementById('sugTitleInput');
        this.sugDate = document.getElementById('sugDate');
        this.sugTagsInput = document.getElementById('sugTagsInput');
        this.btnCopyTags = document.getElementById('btnCopyTags');
        this.sugFeaturedImage = document.getElementById('sugFeaturedImage');
    },

    bindEvents() {
        // Klik na logo/nazwę w nagłówku odświeża stronę (wraca do stanu początkowego, Krok 1).
        this.logoHome.addEventListener('click', (e) => {
            e.preventDefault();
            location.reload();
        });

        this.btnShowIntro.addEventListener('click', () => this.introModal.classList.remove('hidden'));
        this.btnCloseIntro.addEventListener('click', () => {
            this.introModal.classList.add('hidden');
            localStorage.setItem('saf_intro_seen', '1');
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
        this.btnBackToStep1.addEventListener('click', () => this.switchStep(1));
        
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

        this.btnGoToStep3.addEventListener('click', () => {
            const hasFeaturedCandidate = Compressor.processedFiles.some(f => f.isFeatured || this.canBeFeatured(f));
            if (!hasFeaturedCandidate) {
                alert('Żadne z wgranych zdjęć nie nadaje się na obrazek wyróżniający - musi być zdjęciem POZIOMYM w proporcjach 3:2. Dodaj przynajmniej jedno takie zdjęcie, zanim przejdziesz dalej.');
                return;
            }
            this.goToStep3();
        });
        this.btnBackToStep2.addEventListener('click', () => {
            this.switchStep(2);
            this.renderFileList(); // odśwież listę - nazwy mogły się zmienić po Kroku 3 (slug od AI)
        });

        this.btnSubmitModal.addEventListener('click', () => this.closeModal(true));
        this.btnSkipModal.addEventListener('click', () => this.closeModal(false));

        this.btnTriggerAI.addEventListener('click', () => this.generateArticle());
        this.btnCopyHtml.addEventListener('click', () => this.copyGutenbergCode());
        this.btnCopyTitle.addEventListener('click', () => this.copyTitle());
        this.btnCopyTags.addEventListener('click', () => this.copyTags());
        this.btnCopyFallbackPrompt.addEventListener('click', () => this.copyFallbackPrompt());
        this.btnRegenerate.addEventListener('click', () => { this.aiOutput.classList.add('hidden'); this.finalNotes.focus(); });
    },

    // Jedyne miejsce pobierania zdjęć jest w Kroku 3 (po ewentualnym przemianowaniu przez AI),
    // dzięki czemu nazwy w paczce ZAWSZE zgadzają się z linkami w wygenerowanym artykule -
    // nie trzeba już niczego pilnować ani ostrzegać, wystarczy usunąć wcześniejszą możliwość pobrania w Kroku 2.
    downloadPhotosZip() {
        this.ensureFeaturedImage();
        this.renameAllFiles();
        const title = this.evtTitle?.value || "wpis";
        const startDate = this.evtStart.value;
        Compressor.generateZip(title, startDate);
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

    // Anonimowe zgłoszenie: użytkownik tylko opisuje problem i klika "Wyślij" - Worker (patrz
    // js/gemini.js -> sendIssueReport i worker/worker.js) sam przekazuje treść na maila webmastera,
    // bez żadnej akcji ze strony użytkownika (bez mailto:, bez jego klienta pocztowego).
    async sendReport() {
        const category = this.reportCategory.value;
        const description = this.reportDescription.value.trim();
        if (!description) {
            alert('Opisz proszę, na czym polega problem.');
            return;
        }

        this.btnSendReport.disabled = true;
        try {
            await Gemini.sendIssueReport(category, description);
            this.reportModal.classList.add('hidden');
            this.reportDescription.value = '';
            this.showToast('Dzięki za zgłoszenie, zajmę się tym jak najszybciej!');
        } catch (error) {
            alert('Nie udało się wysłać zgłoszenia: ' + error.message);
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
            this.notesLabel.innerHTML = "Twoje surowe notatki / spostrzeżenia:";
            this.evtNotes.placeholder = "Kto brał udział, jaka była atmosfera wydarzenia i co szczególnie przykuło uwagę naszych fotografów...";

            if (category === 'kultura') { this.evtTitle.placeholder = "np. Koncert Myslovitz…"; }
            else if (category === 'nauka') { this.evtTitle.placeholder = "np. MSKN..."; }
            else if (category === 'sport') { this.evtTitle.placeholder = "np. Liga Wydziałów..."; }
        } else {
            this.dynamicFields.style.display = 'none';
            // Bez pól tytuł/miejsce/daty druga kolumna (notatki) zajmuje całą szerokość siatki.
            this.step1Grid.classList.add('single-col');
            if (category === 'zapowiedzi') {
                this.notesLabel.innerHTML = "<strong>Co dokładnie zapowiadasz, kiedy i gdzie to będzie?</strong>";
                this.evtNotes.placeholder = "Opisz szczegółowo zapowiadane wydarzenie: co się wydarzy, kiedy dokładnie i gdzie...";
            } else if (category === 'zycie') {
                this.notesLabel.innerHTML = "<strong>Opisz co się działo w agencji / jakie są ustalenia:</strong>";
                this.evtNotes.placeholder = "Opisz przebieg spotkania lub wydarzenia w agencji: kto brał udział i jakie zapadły ustalenia...";
            }
        }
    },

    switchStep(stepNum) {
        this.state.currentStep = stepNum;
        document.querySelectorAll('.step-section').forEach(s => { s.style.display = 'none'; s.classList.remove('active'); });
        document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
        
        const targetSection = document.getElementById(`step${stepNum}`);
        if (targetSection) { targetSection.style.display = 'block'; targetSection.classList.add('active'); }
        
        const targetIndicator = document.querySelector(`.step[data-step="${stepNum}"]`);
        if (targetIndicator) { targetIndicator.classList.add('active'); }
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

    // Pkt 2: buduje ponumerowane pytania, każde z własnym polem odpowiedzi TUŻ pod nim.
    renderQuestions(questions) {
        this.aiQuestionsContainer.innerHTML = "";

        if (!questions || questions.length === 0) {
            this.aiQuestionsContainer.innerHTML = `<p class="info-text">Agent nie ma dodatkowych pytań - możesz przejść dalej.</p>`;
            return;
        }

        questions.forEach((q, idx) => {
            const block = document.createElement('div');
            block.className = 'question-block';

            const qTitle = document.createElement('div');
            qTitle.className = 'q-title';
            qTitle.textContent = `${idx + 1}. ${q}`;

            const answer = document.createElement('textarea');
            answer.className = 'question-answer';
            answer.rows = 3;
            answer.placeholder = "Twoja odpowiedź (opcjonalnie)...";
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
            alert("BŁĄD: Musisz najpierw wybrać kategorię wpisu z listy.");
            return;
        }

        if (cat === 'kultura' || cat === 'sport' || cat === 'nauka') {
            if (!title || !loc || !start || !end || !notes) {
                alert("BŁĄD: Musisz najpierw wypełnić WSZYSTKIE pola, aby przejść do wgrywania zdjęć.");
                return;
            }
            if (new Date(end) < new Date(start)) {
                alert("BŁĄD: Data zakończenia wydarzenia nie może być wcześniejsza niż data rozpoczęcia. Popraw daty i spróbuj ponownie.");
                return;
            }
        } else {
            if (!notes) {
                alert("BŁĄD: Musisz najpierw wypełnić pole notatek.");
                return;
            }
        }

        this.aiModal.classList.remove('hidden');
        this.btnSubmitModal.disabled = true;
        this.btnSkipModal.disabled = true;
        this.aiQuestionsContainer.innerHTML = "";

        const progress = this.startProgressSimulation(
            this.aiProgressBar,
            this.aiProgressLabel,
            [this.aiProgressWrap, this.aiProgressLabel],
            [
                "Agent analizuje wpisane dane...",
                "Szuka wątków wartych dopytania...",
                "Formułuje pytania pomocnicze..."
            ],
            6000
        );

        try {
            const questions = await Gemini.askForMissingDetails(cat, title, loc, start, end, notes);
            progress.finish("Gotowe!");
            this.renderQuestions(questions);
        } catch (error) {
            progress.stop();
            this.renderQuestions([
                `Nie udało się połączyć z AI (${error.message}). Czy chcesz samodzielnie dodać jakieś kluczowe szczegóły, o których zapomniałeś w notatkach?`
            ]);
        }

        this.btnSubmitModal.disabled = false;
        this.btnSkipModal.disabled = false;
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
        this.switchStep(2);
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
            alert(`Błędny format pliku - pominięto ${rejected.length} ${rejected.length === 1 ? 'plik' : 'plików'}:\n\n- ${rejected.join('\n- ')}\n\nObsługiwane formaty: JPG, PNG, TIFF, DNG, WEBP, HEIC, HEIF, GIF, AVIF, BMP.`);
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
        this.uploadProgressLabel.textContent = `Przygotowywanie ${total} ${total === 1 ? 'zdjęcia' : 'zdjęć'}...`;

        // Wymuszenie natychmiastowego przerysowania strony PRZED zleceniem pracy workerom.
        await new Promise(resolve => requestAnimationFrame(resolve));

        const title = this.evtTitle?.value || "saf-wpis";
        const startDate = this.evtStart.value;
        const skipped = [];

        const fileProgress = new Array(total).fill(0);
        const updateOverallProgress = () => {
            const sum = fileProgress.reduce((a, b) => a + b, 0);
            const pct = Math.round(sum / total);
            this.uploadProgressBar.style.width = pct + '%';
            this.uploadProgressLabel.textContent = `Przetwarzanie ${total} ${total === 1 ? 'zdjęcia' : 'zdjęć'}... (${pct}%)`;
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
            alert(`Nie udało się przetworzyć ${skipped.length} z ${total} plików:\n\n- ${skipped.join('\n- ')}`);
        }
    },

    // Przelicza nazwy WSZYSTKICH plików od nowa: RRRR-MM-{slug}-NR.webp. Slug pochodzi od AI
    // (po Kroku 3 - patrz generateArticle), a dopóki AI się nie wypowiedziało - od tytułu z Kroku 1.
    // Zdjęcie oznaczone jako wyróżniające zawsze dostaje numer "00", niezależnie od pozycji na liście;
    // pozostałe zdjęcia są numerowane kolejno 01, 02... (bez wliczania wyróżniającego).
    renameAllFiles() {
        const startDate = this.evtStart.value;
        const dateObj = new Date(startDate || Date.now());
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const baseSlug = this.state.aiFilenameSlug
            ? Compressor.sanitizeString(this.state.aiFilenameSlug)
            : Compressor.sanitizeString(this.evtTitle?.value || 'saf-wpis');

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
            this.fileStatus.innerHTML = "<p style='text-align:center; padding: 20px; color: var(--text-muted); border: 1px dashed var(--border); border-radius: 6px;'>Brak dodanych zdjęć. Przeciągnij pliki wyżej, aby je dodać.</p>";
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
                ? `<div style="color: var(--danger); font-size: 0.75rem; margin-top: 2px;">⚠️ Nietypowe proporcje (zalecane 3:2, 2:3 lub pion 4:5)</div>`
                : '';
            const featureBtnDisabled = !file.isFeatured && !ratioInfo.featuredEligible;
            const featureBtnTitle = featureBtnDisabled ? ' title="Obrazek wyróżniający musi być zdjęciem poziomym w proporcjach 3:2"' : '';

            item.innerHTML = `
                <div style="display: flex; align-items: center; gap: 15px;">
                    <img src="${file.previewUrl}" style="width: 55px; height: 55px; object-fit: cover; border-radius: 4px; border: 1px solid #3e3e4a;">
                    <div>
                        <span style="font-weight: 500; color: #fff; display: block;">${statusIcon} ${file.name}</span>
                        <span style="color: var(--text-muted); font-size: 0.8rem;">Waga: ${sizeKB} KB</span>
                        ${ratioWarning}
                    </div>
                </div>
                <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                    <button class="btn-feature${file.isFeatured ? ' active' : ''}"${featureBtnTitle} ${featureBtnDisabled ? 'disabled' : ''} style="padding: 8px 12px; font-size: 0.85rem; border-radius: 4px; border: none; cursor: pointer;">${file.isFeatured ? '⭐ Wyróżniające' : '☆ Ustaw jako wyróżniające'}</button>
                    <button class="btn-up" style="background: #2e2e38; color: #fff; padding: 8px 12px; font-size: 0.85rem; border-radius: 4px; border: none; cursor: pointer;">▲</button>
                    <button class="btn-down" style="background: #2e2e38; color: #fff; padding: 8px 12px; font-size: 0.85rem; border-radius: 4px; border: none; cursor: pointer;">▼</button>
                    <button class="btn-del" style="background: var(--danger); color: white; padding: 8px 12px; font-size: 0.85rem; border-radius: 4px; font-weight: bold; border: none; cursor: pointer;">Usuń</button>
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
        this.switchStep(3);
    },

    async generateArticle() {
        this.aiLoading.classList.remove('hidden');
        this.aiOutput.classList.add('hidden');
        this.aiFallback.classList.add('hidden');

        const progress = this.startProgressSimulation(
            this.genProgressBar,
            this.genProgressLabel,
            [],
            [
                "Analizuję notatki...",
                "Redaguję tytuł i lead...",
                "Piszę treść artykułu...",
                "Dobieram tagi...",
                "Formatuję kod dla WordPressa..."
            ],
            11000
        );

        const cat = this.evtCategory.value;
        const notes = this.finalNotes.value;
        const prompt = Gemini.getPromptTemplate(cat, notes);

        try {
            const aiJson = await Gemini.callGemini(prompt);
            progress.finish("Gotowe!");

            const endVal = this.evtEnd.value;
            let pubDate = new Date();
            if (endVal && this.evtCategory.value !== 'zapowiedzi') {
                pubDate = new Date(endVal);
                pubDate.setHours(pubDate.getHours() + 3);
            }

            this.sugTitleInput.value = aiJson.title || '';
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

            const finalGutenbergHTML = Gutenberg.generateBlockCode(aiJson, Compressor.processedFiles);
            this.gutenbergOutput.value = finalGutenbergHTML;

            this.aiLoading.classList.add('hidden');
            this.aiOutput.classList.remove('hidden');
        } catch (error) {
            progress.stop();
            this.aiLoading.classList.add('hidden');
            // Fallback: nazwy zdjęć już bazują na tytule z Kroku 1 (patrz renameAllFiles - aiFilenameSlug
            // jest wtedy dalej puste), więc nic tu nie trzeba dodatkowo naprawiać. Użytkownik dostaje
            // za to gotowy, samowystarczalny prompt do wklejenia w dowolnym zewnętrznym czacie AI.
            this._lastPrompt = prompt;
            this.aiFallbackMessage.textContent = `Nie udało się połączyć z wbudowanym AI (${error.message}). Zdjęcia zachowały nazwy na podstawie nazwy wydarzenia z Kroku 1. Możesz skopiować kompletny prompt poniżej i wkleić go do dowolnego zewnętrznego czatu AI (np. ChatGPT, Claude, Gemini) - wynik będzie odpowiadał temu, co wygenerowałby Redaktor SAF.`;
            this.aiFallback.classList.remove('hidden');
        }
    },

    // Pkt 5: korzystamy z asynchronicznego Clipboard API zamiast select()+execCommand,
    // co dodatkowo ogranicza ryzyko dziwnych "heurystyk" przeglądarki przy kopiowaniu.
    async copyGutenbergCode() {
        const text = this.gutenbergOutput.value;
        try {
            await navigator.clipboard.writeText(text);
        } catch (e) {
            this.gutenbergOutput.select();
            document.execCommand('copy');
        }
        this.showToast('Skopiowano do schowka!');
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
        this.showToast('Skopiowano do schowka!');
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
        this.showToast('Skopiowano do schowka!');
    },

    // Fallback na wypadek awarii wbudowanego AI: kopiuje DOKŁADNIE ten sam prompt, który poszedłby
    // do Gemini, żeby wynik z dowolnego zewnętrznego czatu AI był jak najbardziej zbliżony.
    async copyFallbackPrompt() {
        const text = this._lastPrompt;
        if (!text) return;
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
        this.showToast('Skopiowano do schowka!');
    }
};

window.addEventListener('DOMContentLoaded', () => App.init());