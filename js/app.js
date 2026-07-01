import { Compressor } from './compressor.js';
import { Gemini } from './gemini.js';
import { Gutenberg } from './gutenberg.js';

const App = {
    state: {
        currentStep: 1,
        interviewAnswers: "",
        aiData: null
    },

    init() {
        this.cacheDOM();
        this.bindEvents();
        this.loadApiKey();
        this.handleCategoryChange();
        this.switchStep(1);
    },

    cacheDOM() {
        this.apiKeyInput = document.getElementById('apiKeyInput');
        this.saveKeyBtn = document.getElementById('saveKeyBtn');
        this.toggleKeyVisibility = document.getElementById('toggleKeyVisibility');
        this.evtCategory = document.getElementById('evtCategory');
        this.dynamicFields = document.getElementById('dynamicFields');
        this.notesLabel = document.getElementById('notesLabel');
        this.evtNotes = document.getElementById('evtNotes');
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
        this.btnDownloadPhotos = document.getElementById('btnDownloadPhotos');
        this.btnGoToStep3 = document.getElementById('btnGoToStep3');
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
        this.aiOutput = document.getElementById('aiOutput');
        this.gutenbergOutput = document.getElementById('gutenbergOutput');
        this.sugTitleInput = document.getElementById('sugTitleInput');
        this.sugDate = document.getElementById('sugDate');
        this.sugTags = document.getElementById('sugTags');
    },

    bindEvents() {
        this.saveKeyBtn.addEventListener('click', () => this.saveApiKey());
        this.toggleKeyVisibility.addEventListener('click', () => {
            this.apiKeyInput.classList.toggle('masked-input');
        });
        this.evtCategory.addEventListener('change', () => this.handleCategoryChange());
        
        this.evtStart.addEventListener('change', (e) => {
            if (e.target.value) {
                const datePart = e.target.value.split('T')[0];
                this.evtEnd.value = `${datePart}T00:00`;
            }
        });

        this.btnGoToStep2.addEventListener('click', () => this.handleStep1Submit());
        this.btnBackToStep1.addEventListener('click', () => this.switchStep(1));
        
        this.dropzone.addEventListener('click', (e) => {
            e.preventDefault();
            this.fileInput.click();
        });
        
        this.fileInput.addEventListener('change', (e) => this.handleFiles(e.target.files));
        
        this.dropzone.addEventListener('dragover', (e) => { e.preventDefault(); this.dropzone.style.borderColor = 'var(--primary)'; });
        this.dropzone.addEventListener('dragleave', () => { this.dropzone.style.borderColor = 'var(--border)'; });
        this.dropzone.addEventListener('drop', (e) => { e.preventDefault(); this.handleFiles(e.dataTransfer.files); });

        this.btnDownloadPhotos.addEventListener('click', () => {
            const title = this.evtTitle?.value || "wpis";
            const startDate = this.evtStart.value;
            Compressor.generateZip(title, startDate);
        });
        
        this.btnGoToStep3.addEventListener('click', () => this.goToStep3());
        
        this.btnSubmitModal.addEventListener('click', () => this.closeModal(true));
        this.btnSkipModal.addEventListener('click', () => this.closeModal(false));
        
        this.btnTriggerAI.addEventListener('click', () => this.generateArticle());
        this.btnCopyHtml.addEventListener('click', () => this.copyGutenbergCode());
        this.btnCopyTitle.addEventListener('click', () => this.copyTitle());
        this.btnRegenerate.addEventListener('click', () => { this.aiOutput.classList.add('hidden'); this.finalNotes.focus(); });
    },

    // Pkt 7: klucz "oficjalny" (redakcji) NIE jest już zaszyty w kodzie strony.
    // Pole służy wyłącznie do wklejenia WŁASNEGO, osobistego klucza - jeśli zostanie puste,
    // aplikacja automatycznie korzysta z bezpiecznego proxy (patrz js/gemini.js).
    loadApiKey() {
        const saved = localStorage.getItem('saf_gemini_key');
        if (saved) {
            this.apiKeyInput.value = saved;
        } else {
            this.apiKeyInput.value = "";
            this.apiKeyInput.placeholder = "Opcjonalnie: własny klucz Gemini API...";
        }
    },

    saveApiKey() {
        const key = this.apiKeyInput.value.trim();
        if (!key) {
            localStorage.removeItem('saf_gemini_key');
            alert('Usunięto zapisany klucz. Od teraz używane jest bezpieczne, domyślne proxy redakcji.');
            return;
        }
        localStorage.setItem('saf_gemini_key', key);
        alert('Zapisano Twój osobisty klucz w tej przeglądarce!');
    },

    handleCategoryChange() {
        const category = this.evtCategory.value;
        if (category === 'kultura' || category === 'sport' || category === 'nauka') {
            this.dynamicFields.style.display = 'block';
            this.notesLabel.innerHTML = "Twoje surowe notatki / spostrzeżenia:";
            this.evtNotes.placeholder = "Kto uczestniczył, jaka była atmosfera, co przykuło uwagę fotografów...";
            
            if (category === 'kultura') { this.evtTitle.placeholder = "np. Koncert Myslovitz…"; } 
            else if (category === 'nauka') { this.evtTitle.placeholder = "np. MSKN..."; } 
            else if (category === 'sport') { this.evtTitle.placeholder = "np. Liga Wydziałów..."; }
        } else {
            this.dynamicFields.style.display = 'none';
            if (category === 'zapowiedzi') {
                this.notesLabel.innerHTML = "<strong>Co dokładnie zapowiadasz, kiedy i gdzie to będzie?</strong>";
                this.evtNotes.placeholder = "Opisz planowane wydarzenie, datę, godzinę, miejsce...";
            } else if (category === 'zycie') {
                this.notesLabel.innerHTML = "<strong>Opisz co się działo w agencji / jakie są ustalenia:</strong>";
                this.evtNotes.placeholder = "Co robiliście, kto brał udział, jakie zapadły decyzje...";
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

        if (cat === 'kultura' || cat === 'sport' || cat === 'nauka') {
            if (!title || !loc || !start || !end || !notes) {
                alert("BŁĄD: Musisz najpierw wypełnić WSZYSTKIE pola, aby przejść do wgrywania zdjęć.");
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
            const apiKey = this.apiKeyInput.value.trim();
            const questions = await Gemini.askForMissingDetails(apiKey, cat, title, loc, start, end, notes);
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
        const incomingFiles = Array.from(files);
        const total = incomingFiles.length;

        // Pkt 4: pasek postępu jest już obecny w DOM (nie tworzymy go dynamicznie),
        // więc pokazuje się natychmiast po odsłonięciu klasy "hidden".
        this.uploadProgressWrap.classList.remove('hidden');
        this.uploadProgressLabel.classList.remove('hidden');
        this.uploadProgressBar.style.width = '0%';
        this.uploadProgressLabel.textContent = `Przygotowywanie ${total} ${total === 1 ? 'zdjęcia' : 'zdjęć'}...`;

        this.btnDownloadPhotos.disabled = true;
        this.btnGoToStep3.disabled = true;

        // Wymuszenie natychmiastowego przerysowania strony PRZED ciężką pracą (naprawia zawieszkę z pkt 4)
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        const title = this.evtTitle?.value || "saf-wpis";
        const startDate = this.evtStart.value;
        const skipped = [];

        for (let i = 0; i < incomingFiles.length; i++) {
            try {
                const nextIndex = Compressor.processedFiles.length;
                const res = await Compressor.processImage(incomingFiles[i], nextIndex, title, startDate);
                Compressor.processedFiles.push(res);
            } catch (err) {
                console.error(err);
                // Naprawa: wcześniej błąd trafiał TYLKO do konsoli, więc pominięty plik
                // znikał bez żadnej informacji dla użytkownika. Teraz zbieramy komunikaty
                // i pokazujemy je zbiorczo na końcu (patrz alert() poniżej).
                skipped.push(err?.message || incomingFiles[i].name);
            }

            const done = i + 1;
            const pct = Math.round((done / total) * 100);
            this.uploadProgressBar.style.width = pct + '%';
            this.uploadProgressLabel.textContent = `Przetworzono ${done} z ${total} zdjęć (${pct}%)...`;
        }

        this.uploadProgressWrap.classList.add('hidden');
        this.uploadProgressLabel.classList.add('hidden');
        this.fileInput.value = "";
        this.renderFileList();

        if (skipped.length > 0) {
            alert(`Nie udało się przetworzyć ${skipped.length} z ${total} plików:\n\n- ${skipped.join('\n- ')}`);
        }
    },

    renderFileList() {
        this.fileStatus.innerHTML = "";
        
        if (Compressor.processedFiles.length === 0) {
            this.fileStatus.innerHTML = "<p style='text-align:center; padding: 20px; color: var(--text-muted); border: 1px dashed var(--border); border-radius: 6px;'>Brak dodanych zdjęć. Przeciągnij pliki wyżej, aby je dodać.</p>";
            this.btnDownloadPhotos.disabled = true;
            this.btnGoToStep3.disabled = true;
            return;
        }

        const title = this.evtTitle?.value || "saf-wpis";
        const startDate = this.evtStart.value;
        const dateObj = new Date(startDate || Date.now());
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const safeTitle = Compressor.sanitizeString(title);

        Compressor.processedFiles.forEach((file, index) => {
            const numStr = String(index + 1).padStart(2, '0');
            file.name = `${year}-${month}-${safeTitle}-${numStr}.webp`;
            file.wpPath = `/wp-content/uploads/${year}/${month}/${file.name}`;

            const item = document.createElement('div');
            item.style.cssText = "display: flex; align-items: center; justify-content: space-between; padding: 10px; background: #1c1c22; margin-bottom: 8px; border-radius: 6px; border: 1px solid var(--border);";
            
            const sizeKB = (file.size/1024).toFixed(1);

            item.innerHTML = `
                <div style="display: flex; align-items: center; gap: 15px;">
                    <img src="${file.previewUrl}" style="width: 55px; height: 55px; object-fit: cover; border-radius: 4px; border: 1px solid #3e3e4a;">
                    <div>
                        <span style="font-weight: 500; color: #fff; display: block;">✅ ${file.name}</span>
                        <span style="color: var(--text-muted); font-size: 0.8rem;">Waga: ${sizeKB} KB</span>
                    </div>
                </div>
                <div style="display: flex; gap: 6px;">
                    <button class="btn-up" style="background: #2e2e38; color: #fff; padding: 8px 12px; font-size: 0.85rem; border-radius: 4px; border: none; cursor: pointer;">▲</button>
                    <button class="btn-down" style="background: #2e2e38; color: #fff; padding: 8px 12px; font-size: 0.85rem; border-radius: 4px; border: none; cursor: pointer;">▼</button>
                    <button class="btn-del" style="background: var(--danger); color: white; padding: 8px 12px; font-size: 0.85rem; border-radius: 4px; font-weight: bold; border: none; cursor: pointer;">Usuń</button>
                </div>
            `;
            
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
                Compressor.processedFiles.splice(index, 1);
                this.renderFileList();
            });

            this.fileStatus.appendChild(item);
        });

        this.btnDownloadPhotos.disabled = false;
        this.btnGoToStep3.disabled = false;
    },

    goToStep3() {
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

        this.finalNotes.value = compiledInformation;
        this.switchStep(3);
    },

    async generateArticle() {
        this.aiLoading.classList.remove('hidden');
        this.aiOutput.classList.add('hidden');

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
        const apiKey = this.apiKeyInput.value.trim();

        try {
            const aiJson = await Gemini.callGemini(apiKey, prompt);
            this.state.aiData = aiJson;
            progress.finish("Gotowe!");

            const endVal = this.evtEnd.value;
            let pubDate = new Date();
            if (endVal && this.evtCategory.value !== 'zapowiedzi') {
                pubDate = new Date(endVal);
                pubDate.setHours(pubDate.getHours() + 3);
            }
            
            this.sugTitleInput.value = aiJson.title || '';
            this.sugDate.innerText = pubDate.toLocaleString('pl-PL');
            this.sugTags.innerText = aiJson.tags ? aiJson.tags.join(', ') : 'brak';

            const finalGutenbergHTML = Gutenberg.generateBlockCode(aiJson, Compressor.processedFiles);
            this.gutenbergOutput.value = finalGutenbergHTML;

            this.aiLoading.classList.add('hidden');
            this.aiOutput.classList.remove('hidden');
        } catch (error) {
            progress.stop();
            this.aiLoading.classList.add('hidden');
            alert("Błąd AI: " + error.message);
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
        alert('Skopiowano kod bloku WordPress!');
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
        alert('Skopiowano tytuł wpisu!');
    }
};

window.addEventListener('DOMContentLoaded', () => App.init());