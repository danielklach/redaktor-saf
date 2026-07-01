import { Compressor } from './compressor.js';
import { Gemini } from './gemini.js';
import { Gutenberg } from './gutenberg.js';

const App = {
    state: {
        currentStep: 1,
        filesToProcess: [],
        interviewAnswers: "",
        aiData: null
    },

    init() {
        this.cacheDOM();
        this.bindEvents();
        this.loadApiKey();
        this.handleCategoryChange();
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
        
        this.btnGoToStep2 = document.getElementById('btnGoToStep2');
        this.btnBackToStep1 = document.getElementById('btnBackToStep1');
        this.btnDownloadPhotos = document.getElementById('btnDownloadPhotos');
        this.btnGoToStep3 = document.getElementById('btnGoToStep3');
        this.btnTriggerAI = document.getElementById('btnTriggerAI');
        this.btnCopyHtml = document.getElementById('btnCopyHtml');
        this.btnRegenerate = document.getElementById('btnRegenerate');

        this.aiModal = document.getElementById('aiModal');
        this.aiQuestionText = document.getElementById('aiQuestionText');
        this.aiAnswerText = document.getElementById('aiAnswerText');
        this.btnSkipModal = document.getElementById('btnSkipModal');
        this.btnSubmitModal = document.getElementById('btnSubmitModal');

        this.finalNotes = document.getElementById('finalNotes');
        this.aiLoading = document.getElementById('aiLoading');
        this.aiOutput = document.getElementById('aiOutput');
        this.gutenbergOutput = document.getElementById('gutenbergOutput');
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

        this.btnDownloadPhotos.addEventListener('click', () => Compressor.generateZip());
        this.btnGoToStep3.addEventListener('click', () => this.goToStep3());
        
        this.btnSubmitModal.addEventListener('click', () => this.closeModal(true));
        this.btnSkipModal.addEventListener('click', () => this.closeModal(false));
        
        this.btnTriggerAI.addEventListener('click', () => this.generateArticle());
        this.btnCopyHtml.addEventListener('click', () => this.copyToClipboard());
        this.btnRegenerate.addEventListener('click', () => { this.aiOutput.classList.add('hidden'); this.finalNotes.focus(); });
    },

    loadApiKey() {
        const officialKey = "AQ.Ab8RN6IuYXGYjFNDrkmkYkcACi1plSBa1s1FwJsLuCatQhnK4Q";
        const saved = localStorage.getItem('saf_gemini_key');
        if (saved) { 
            this.apiKeyInput.value = saved; 
        } else {
            this.apiKeyInput.value = officialKey;
            this.apiKeyInput.placeholder = "Używasz oficjalnego klucza SAF Jamnik";
        }
    },

    saveApiKey() {
        localStorage.setItem('saf_gemini_key', this.apiKeyInput.value);
        alert('Klucz API zapisany lokalnie!');
    },

    handleCategoryChange() {
        const category = this.evtCategory.value;
        if (category === 'kultura' || category === 'sport') {
            this.dynamicFields.classList.remove('hidden');
            this.notesLabel.innerHTML = "Twoje surowe notatki / spostrzeżenia:";
            this.evtNotes.placeholder = "Kto grał, jaka była atmosfera, ile było ludzi...";
        } else {
            this.dynamicFields.classList.add('hidden');
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
        document.querySelectorAll('.step-section').forEach(s => s.classList.remove('active'));
        document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
        
        document.getElementById(`step${stepNum}`).classList.add('active');
        document.querySelector(`.step[data-step="${stepNum}"]`).classList.add('active');
    },

    handleStep1Submit() {
        const cat = this.evtCategory.value;
        const title = this.evtTitle?.value || "Wpis SAF";
        
        this.aiQuestionText.innerText = Gemini.getInterviewQuestion(cat, title);
        this.aiAnswerText.value = "";
        this.aiModal.classList.remove('hidden');
    },

    closeModal(saveData) {
        if (saveData && this.aiAnswerText.value.trim() !== "") {
            this.state.interviewAnswers = this.aiAnswerText.value.trim();
        } else {
            this.state.interviewAnswers = "";
        }
        this.aiModal.classList.add('hidden');
        this.switchStep(2);
    },

    async handleFiles(files) {
        if(!files || files.length === 0) return;
        this.state.filesToProcess = Array.from(files);
        this.fileStatus.innerHTML = "<p>Trwa kompresja obrazów do WebP...</p>";
        
        Compressor.processedFiles = [];
        const title = this.evtTitle?.value || "saf-wpis";
        const startDate = this.evtStart.value;

        for (let i = 0; i < this.state.filesToProcess.length; i++) {
            try {
                const res = await Compressor.processImage(this.state.filesToProcess[i], i, title, startDate);
                Compressor.processedFiles.push(res);
                this.fileStatus.innerHTML += `<div class="file-item"><span>✅ ${res.name}</span><span>${(res.size/1024).toFixed(1)} KB</span></div>`;
            } catch (err) {
                this.fileStatus.innerHTML += `<div class="file-item" style="color:var(--danger)">❌ Błąd pliku ${i+1}</div>`;
            }
        }

        this.btnDownloadPhotos.disabled = false;
        this.btnGoToStep3.disabled = false;
    },

    goToStep3() {
        const cat = this.evtCategory.value;
        let compiledInformation = "";

        // Zbieranie wszystkich danych w jeden czytelny blok tekstowy (Punkt 1)
        if (cat === 'kultura' || cat === 'sport') {
            compiledInformation += `Wydarzenie: ${this.evtTitle.value || 'Brak nazwy'}\n`;
            compiledInformation += `Miejsce: ${this.evtLocation.value || 'Brak miejsca'}\n`;
            compiledInformation += `Czas: od ${this.evtStart.value || '?'} do ${this.evtEnd.value || '?'}\n\n`;
        }
        
        compiledInformation += `Główne notatki autora:\n${this.evtNotes.value}\n`;
        
        if (this.state.interviewAnswers) {
            compiledInformation += `\nDodatkowe szczegóły uzyskane z wywiadu:\n${this.state.interviewAnswers}`;
        }

        this.finalNotes.value = compiledInformation;
        this.switchStep(3);
    },

    async generateArticle() {
        const apiKey = this.apiKeyInput.value.trim();
        if(!apiKey) return alert("Brak klucza API!");

        this.aiLoading.classList.remove('hidden');
        this.aiOutput.classList.add('hidden');

        const cat = this.evtCategory.value;
        const notes = this.finalNotes.value; // AI bierze tekst WYŁĄCZNIE stąd
        const prompt = Gemini.getPromptTemplate(cat, notes);

        try {
            const aiJson = await Gemini.callGemini(apiKey, prompt);
            this.state.aiData = aiJson;

            const endVal = this.evtEnd.value;
            let pubDate = new Date();
            if(endVal && this.evtCategory.value !== 'zapowiedzi') {
                pubDate = new Date(endVal);
                pubDate.setHours(pubDate.getHours() + 3);
            }
            
            this.sugDate.innerText = pubDate.toLocaleString('pl-PL');
            this.sugTags.innerText = aiJson.tags ? aiJson.tags.join(', ') : 'brak';

            const finalGutenbergHTML = Gutenberg.generateBlockCode(aiJson, Compressor.processedFiles);
            this.gutenbergOutput.value = finalGutenbergHTML;

            this.aiLoading.classList.add('hidden');
            this.aiOutput.classList.remove('hidden');
        } catch (error) {
            this.aiLoading.classList.add('hidden');
            alert("Błąd AI: " + error.message);
        }
    },

    copyToClipboard() {
        this.gutenbergOutput.select();
        document.execCommand('copy');
        alert('Skopiowano kod bloku WordPress!');
    }
};

window.addEventListener('DOMContentLoaded', () => App.init());