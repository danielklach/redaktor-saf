import { Compressor } from './compressor.js';
import { Gemini } from './gemini.js';
import { Gutenberg } from './gutenberg.js';

const App = {
    state: {
        currentStep: 1,
        interviewAnswers: "",
        externalArticle: "",
        aiData: null,
        progressInterval: null,
        zipDownloaded: false // Flaga sprawdzająca, czy użytkownik pamiętał o pobraniu zdjęć
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
        this.modalLoading = document.getElementById('modalLoading');
        this.modalContentArea = document.getElementById('modalContentArea');
        this.aiQuestionsContainer = document.getElementById('aiQuestionsContainer');
        this.aiExternalArticle = document.getElementById('aiExternalArticle');
        this.modalProgressBar = document.getElementById('modalProgressBar');
        this.btnSkipModal = document.getElementById('btnSkipModal');
        this.btnSubmitModal = document.getElementById('btnSubmitModal');

        this.finalNotes = document.getElementById('finalNotes');
        this.aiLoading = document.getElementById('aiLoading');
        this.articleProgressBar = document.getElementById('articleProgressBar');
        this.aiOutput = document.getElementById('aiOutput');
        this.gutenbergOutput = document.getElementById('gutenbergOutput');
        this.outTitle = document.getElementById('outTitle');
        this.sugDate = document.getElementById('sugDate');
        this.sugTags = document.getElementById('sugTags');
    },

    bindEvents() {
        this.saveKeyBtn.addEventListener('click', () => this.saveApiKey());
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
            this.state.zipDownloaded = true; // Flaga bezpieczeństwa - oznacz pobranie
        });
        
        this.btnGoToStep3.addEventListener('click', () => this.goToStep3());
        
        this.btnSubmitModal.addEventListener('click', () => this.closeModal(true));
        this.btnSkipModal.addEventListener('click', () => this.closeModal(false));
        
        this.btnTriggerAI.addEventListener('click', () => this.generateArticle());
        this.btnCopyHtml.addEventListener('click', () => {
            navigator.clipboard.writeText(this.gutenbergOutput.value).then(() => { alert('Skopiowano kod artykułu!'); });
        });
        this.btnCopyTitle.addEventListener('click', () => {
            navigator.clipboard.writeText(this.outTitle.value).then(() => { alert('Skopiowano tytuł!'); });
        });
        this.btnRegenerate.addEventListener('click', () => { this.aiOutput.classList.add('hidden'); this.btnTriggerAI.scrollIntoView(); });
    },

    loadApiKey() {
        this.apiKeyInput.value = "";
    },

    saveApiKey() {
        alert('Klucze są teraz autoryzowane za pomocą bezpiecznego proxy na serwerze! Nie musisz wpisywać klucza do przeglądarki.');
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

    startProgressBar(element) {
        element.style.width = '0%';
        let width = 0;
        this.state.progressInterval = setInterval(() => {
            if(width < 90) { 
                width += Math.random() * 8; 
                if(width > 90) width = 90;
                element.style.width = width + '%'; 
            }
        }, 600);
    },

    stopProgressBar(element) {
        clearInterval(this.state.progressInterval);
        element.style.width = '100%';
    },

    async handleStep1Submit() {
        const cat = this.evtCategory.value;
        const title = this.evtTitle?.value || "";
        const loc = this.evtLocation?.value || "";
        const start = this.evtStart?.value || "";
        const end = this.evtEnd?.value || "";
        const notes = this.evtNotes.value.trim();

        if (cat === 'kultura' || cat === 'sport' || cat === 'nauka') {
            if (!title || !loc || !start || !end || !notes) {
                alert("BŁĄD: Musisz najpierw wypełnić WSZYSTKIE pola, aby przejść dalej.");
                return;
            }
        } else {
            if (!notes) {
                alert("BŁĄD: Musisz najpierw wypełnić pole notatek.");
                return;
            }
        }

        this.aiExternalArticle.value = "";
        this.aiModal.classList.remove('hidden');
        this.modalLoading.classList.remove('hidden');
        this.modalContentArea.classList.add('hidden');
        this.btnSubmitModal.classList.add('hidden');
        this.startProgressBar(this.modalProgressBar);

        try {
            const apiKey = "DUMMY_KEY_PROXY";
            const questionsArray = await Gemini.askForMissingDetails(apiKey, cat, title, loc, start, end, notes);
            
            this.aiQuestionsContainer.innerHTML = '';
            questionsArray.forEach((q, index) => {
                this.aiQuestionsContainer.innerHTML += `
                    <div class="q-block">
                        <label>${index + 1}. ${q}</label>
                        <textarea class="ai-ans-input" data-question="${q}" rows="2" placeholder="Odpowiedź..."></textarea>
                    </div>
                `;
            });

            this.stopProgressBar(this.modalProgressBar);
            setTimeout(() => {
                this.modalLoading.classList.add('hidden');
                this.modalContentArea.classList.remove('hidden');
                this.btnSubmitModal.classList.remove('hidden');
            }, 300);

        } catch (error) {
            this.stopProgressBar(this.modalProgressBar);
            this.aiQuestionsContainer.innerHTML = `<div class="q-block"><label>Wystąpił błąd podczas analizy AI. Podaj dodatkowe informacje z pamięci:</label><textarea class="ai-ans-input" data-question="Dodatkowe informacje z pamięci:" rows="4"></textarea></div>`;
            this.modalLoading.classList.add('hidden');
            this.modalContentArea.classList.remove('hidden');
            this.btnSubmitModal.classList.remove('hidden');
        }
    },

    closeModal(saveData) {
        if (saveData) {
            let combined = "";
            document.querySelectorAll('.ai-ans-input').forEach(input => {
                if(input.value.trim()) {
                    combined += `Pytanie AI: ${input.getAttribute('data-question')}\nOdpowiedź Autora: ${input.value.trim()}\n\n`;
                }
            });
            this.state.interviewAnswers = combined;
            this.state.externalArticle = this.aiExternalArticle.value.trim();
        } else {
            this.state.interviewAnswers = "";
            this.state.externalArticle = "";
        }
        
        this.aiModal.classList.add('hidden');
        this.switchStep(2);
        this.renderFileList();
    },

    async handleFiles(files) {
        if (!files || files.length === 0) return;
        const incomingFiles = Array.from(files);
        const total = incomingFiles.length;

        this.uploadProgressWrap.classList.remove('hidden');
        this.uploadProgressLabel.classList.remove('hidden');
        this.uploadProgressBar.style.width = '0%';
        this.uploadProgressLabel.textContent = `Przygotowywanie ${total} plików...`;

        this.btnDownloadPhotos.disabled = true;
        this.btnGoToStep3.disabled = true;
        this.state.zipDownloaded = false; // Nowe zdjęcia kasują status "bezpiecznego" archiwum

        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await new Promise(resolve => setTimeout(resolve, 50));

        const title = this.evtTitle?.value || "saf-wpis";
        const startDate = this.evtStart.value;
        const skipped = [];

        for (let i = 0; i < incomingFiles.length; i++) {
            try {
                this.uploadProgressLabel.textContent = `Przetwarzanie pliku ${i + 1} z ${total}...`;
                await new Promise(resolve => setTimeout(resolve, 20));

                const nextIndex = Compressor.processedFiles.length;
                const res = await Compressor.processImage(incomingFiles[i], nextIndex, title, startDate);
                Compressor.processedFiles.push(res);
            } catch (err) {
                console.error(err);
                skipped.push(err?.message || incomingFiles[i].name);
            }

            const pct = Math.round(((i + 1) / total) * 100);
            this.uploadProgressBar.style.width = pct + '%';
        }

        this.uploadProgressWrap.classList.add('hidden');
        this.uploadProgressLabel.classList.add('hidden');
        this.fileInput.value = "";
        this.renderFileList();

        if (skipped.length > 0) {
            alert(`Pominięto ${skipped.length} plików.\nSzczegóły:\n- ${skipped.join('\n- ')}`);
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

        // Tytuł zależy od tego czy AI już go wygenerowało, czy użwamy wstępnego z kroku 1
        const slug = this.state.aiData?.image_slug 
            ? Compressor.sanitizeString(this.state.aiData.image_slug) 
            : Compressor.sanitizeString(this.evtTitle?.value || 'wydarzenie');

        const startDate = this.evtStart.value;
        const dateObj = new Date(startDate || Date.now());
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');

        let nonFeaturedCounter = 1;

        Compressor.processedFiles.forEach((file, index) => {
            let numStr;
            // Wymóg "00" na obrazku wyróżniającym. Jeśli plik nie jest wyróżniający, zaczynamy klasycznie od "01"
            if (file.isFeatured) {
                numStr = '00';
            } else {
                numStr = String(nonFeaturedCounter++).padStart(2, '0');
            }

            file.name = `${year}-${month}-${slug}-${numStr}.webp`;
            file.wpPath = `/wp-content/uploads/${year}/${month}/${file.name}`;

            const item = document.createElement('div');
            item.style.cssText = "display: flex; align-items: center; justify-content: space-between; padding: 10px; background: #1c1c22; margin-bottom: 8px; border-radius: 6px; border: 1px solid var(--border);";
            
            const sizeKB = (file.size/1024).toFixed(1);

            // Logika wyświetlania "gwiazdki" jeśli wybrane na Wyróżniający (zastępuje przycisk)
            const featuredBtnHtml = file.isFeatured 
                ? `<span style="color:var(--primary); font-size:0.8rem; font-weight:bold; display:flex; align-items:center; margin-right: 10px;">⭐ Wyróżniające</span>`
                : `<button class="btn-feat" style="background: #2e2e38; color: var(--primary); padding: 8px 12px; font-size: 0.85rem; border-radius: 4px; border: 1px solid var(--primary); cursor: pointer; font-weight:bold;">⭐ Ustaw jako wyróżniający</button>`;

            item.innerHTML = `
                <div style="display: flex; align-items: center; gap: 15px;">
                    <img src="${file.previewUrl}" style="width: 55px; height: 55px; object-fit: cover; border-radius: 4px; border: 1px solid #3e3e4a;">
                    <div>
                        <span style="font-weight: 500; color: #fff; display: block;">✅ ${file.name}</span>
                        <span style="color: var(--text-muted); font-size: 0.8rem;">Waga: ${sizeKB} KB</span>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    ${featuredBtnHtml}
                    <button class="btn-up" style="background: #2e2e38; color: #fff; padding: 8px 12px; font-size: 0.85rem; border-radius: 4px; border: none; cursor: pointer;">▲</button>
                    <button class="btn-down" style="background: #2e2e38; color: #fff; padding: 8px 12px; font-size: 0.85rem; border-radius: 4px; border: none; cursor: pointer;">▼</button>
                    <button class="btn-del" style="background: var(--danger); color: white; padding: 8px 12px; font-size: 0.85rem; border-radius: 4px; font-weight: bold; border: none; cursor: pointer;">Usuń</button>
                </div>
            `;
            
            // Obsługa kliknięcia "Ustaw jako wyróżniający"
            if (!file.isFeatured) {
                item.querySelector('.btn-feat').addEventListener('click', (e) => {
                    e.preventDefault();
                    Compressor.processedFiles.forEach(f => f.isFeatured = false);
                    Compressor.processedFiles[index].isFeatured = true;
                    
                    // Przesunięcie elementu na absolutny szczyt tablicy (indeks 0)
                    const temp = Compressor.processedFiles.splice(index, 1)[0];
                    Compressor.processedFiles.unshift(temp);
                    
                    this.state.zipDownloaded = false; // Jakakolwiek zmiana kolejności / nazw unieważnia pobraną paczkę
                    this.renderFileList();
                });
            }

            item.querySelector('.btn-up').addEventListener('click', (e) => {
                e.preventDefault();
                if (index > 0) {
                    const temp = Compressor.processedFiles[index];
                    Compressor.processedFiles[index] = Compressor.processedFiles[index - 1];
                    Compressor.processedFiles[index - 1] = temp;
                    this.state.zipDownloaded = false;
                    this.renderFileList();
                }
            });

            item.querySelector('.btn-down').addEventListener('click', (e) => {
                e.preventDefault();
                if (index < Compressor.processedFiles.length - 1) {
                    const temp = Compressor.processedFiles[index];
                    Compressor.processedFiles[index] = Compressor.processedFiles[index + 1];
                    Compressor.processedFiles[index + 1] = temp;
                    this.state.zipDownloaded = false;
                    this.renderFileList();
                }
            });

            item.querySelector('.btn-del').addEventListener('click', (e) => {
                e.preventDefault();
                Compressor.processedFiles.splice(index, 1);
                this.state.zipDownloaded = false;
                this.renderFileList();
            });

            this.fileStatus.appendChild(item);
        });

        this.btnDownloadPhotos.disabled = false;
        this.btnGoToStep3.disabled = false;
    },

    goToStep3() {
        // Zabezpieczenie przed utratą zmodyfikowanych lub zoptymalizowanych plików
        if (!this.state.zipDownloaded && Compressor.processedFiles.length > 0) {
            const confirmProceed = confirm("UWAGA! Masz niepobraną (lub zmienioną) paczkę zdjęć ZIP.\n\nCzy na pewno chcesz przejść do generowania wpisu, ryzykując utratę ułożonych i zoptymalizowanych zdjęć?");
            if (!confirmProceed) return;
        }

        // Jeśli użytkownik zapomniał wybrać obrazka wyróżniającego przed krokiem 3 - robimy to losowo za niego.
        if (Compressor.processedFiles.length > 0) {
            const featuredExists = Compressor.processedFiles.some(f => f.isFeatured);
            if (!featuredExists) {
                const randIndex = Math.floor(Math.random() * Compressor.processedFiles.length);
                Compressor.processedFiles[randIndex].isFeatured = true;
                
                // Wypychamy wylosowane zdjęcie na 1 miejsce w tabeli
                const temp = Compressor.processedFiles.splice(randIndex, 1)[0];
                Compressor.processedFiles.unshift(temp);
                
                // Aktualizujemy numery na żywo żeby "00" zapisało się w obiekcie
                this.renderFileList(); 
            }
        }

        const cat = this.evtCategory.value;
        let compiledInformation = "";

        if (cat === 'kultura' || cat === 'sport' || cat === 'nauka') {
            compiledInformation += `Wydarzenie: ${this.evtTitle.value}\n`;
            compiledInformation += `Miejsce: ${this.evtLocation.value}\n`;
            compiledInformation += `Czas: od ${this.evtStart.value} do ${this.evtEnd.value}\n\n`;
        }
        
        compiledInformation += `Główne notatki:\n${this.evtNotes.value}\n\n`;
        
        if (this.state.interviewAnswers) {
            compiledInformation += `--- Dodatkowe szczegóły z wywiadu AI ---\n${this.state.interviewAnswers}\n\n`;
        }
        if (this.state.externalArticle) {
            compiledInformation += `--- ZEWNĘTRZNY ARTYKUŁ (INSPIRACJA O ZEWNĘTRZNE FAKTY) ---\n${this.state.externalArticle}\n\n`;
        }

        this.finalNotes.value = compiledInformation;
        this.switchStep(3);
    },

    async generateArticle() {
        this.aiLoading.classList.remove('hidden');
        this.aiOutput.classList.add('hidden');
        this.startProgressBar(this.articleProgressBar);

        const cat = this.evtCategory.value;
        const notes = this.finalNotes.value;
        const prompt = Gemini.getPromptTemplate(cat, notes);

        try {
            const aiJson = await Gemini.callGemini("DUMMY_KEY_PROXY", prompt);
            this.state.aiData = aiJson;

            // --- Płynna zmiana nazw plików zdjęć w locie po uzyskaniu dobrego Tytułu ---
            if (Compressor.processedFiles.length > 0) {
                this.renderFileList(); 
            }

            const endVal = this.evtEnd.value;
            let pubDate = new Date();
            if(endVal && this.evtCategory.value !== 'zapowiedzi') {
                pubDate = new Date(endVal);
                pubDate.setHours(pubDate.getHours() + 3);
            }
            
            this.sugDate.innerText = pubDate.toLocaleString('pl-PL');
            this.sugTags.innerText = aiJson.tags ? aiJson.tags.join(', ') : 'brak';

            this.outTitle.value = aiJson.title || "Tytuł Artykułu";

            const finalGutenbergHTML = Gutenberg.generateBlockCode(aiJson, Compressor.processedFiles);
            this.gutenbergOutput.value = finalGutenbergHTML;

            this.stopProgressBar(this.articleProgressBar);
            setTimeout(() => {
                this.aiLoading.classList.add('hidden');
                this.aiOutput.classList.remove('hidden');
            }, 300);
            
        } catch (error) {
            this.stopProgressBar(this.articleProgressBar);
            this.aiLoading.classList.add('hidden');
            alert("Błąd AI: " + error.message);
        }
    }
};

window.addEventListener('DOMContentLoaded', () => App.init());