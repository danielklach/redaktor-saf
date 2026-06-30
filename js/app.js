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
    },

    cacheDOM() {
        this.apiKeyInput = document.getElementById('apiKeyInput');
        this.saveKeyBtn = document.getElementById('saveKeyBtn');
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
        this.btnGoToStep2.addEventListener('click', () => this.handleStep1Submit());
        this.btnBackToStep1.addEventListener('click', () => this.switchStep(1));
        
        this.dropzone.addEventListener('click', () => this.fileInput.click());
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
        const saved = localStorage.getItem('saf_gemini_key');
        if (saved) { this.apiKeyInput.value = saved; }
    },

    saveApiKey() {
        localStorage.setItem('saf_gemini_key', this.apiKeyInput.value);
        alert('Klucz API zapisany lokalnie!');
    },

    switchStep(stepNum) {
        this.state.currentStep = stepNum;
        document.querySelectorAll('.step-section').forEach(s => s.classList.remove('active'));
        document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
        
        document.getElementById(`step${stepNum}`).classList.add('active');
        document.querySelector(`.step[data-step="${stepNum}"]`).classList.add('active');
    },

    handleStep1Submit() {
        const cat = document.getElementById('evtCategory').value;
        const title = document.getElementById('evtTitle').value;
        
        this.aiQuestionText.innerText = Gemini.getInterviewQuestion(cat, title);
        this.aiAnswerText.value = "";
        this.aiModal.classList.remove('hidden');
    },

    closeModal(saveData) {
        if (saveData && this.aiAnswerText.value.trim() !== "") {
            this.state.interviewAnswers = this.aiAnswerText.value.trim();
        }
        this.aiModal.classList.add('hidden');
        this.switchStep(2);
    },

    async handleFiles(files) {
        if(files.length === 0) return;
        this.state.filesToProcess = Array.from(files);
        this.fileStatus.innerHTML = "<p>Trwa kompresja obrazów do WebP...</p>";
        
        Compressor.processedFiles = [];
        const title = document.getElementById('evtTitle').value;
        const startDate = document.getElementById('evtStart').value;

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
        const baseNotes = document.getElementById('evtNotes').value;
        this.finalNotes.value = baseNotes + (this.state.interviewAnswers ? `\n\n[Dodatkowe szczegóły z wywiadu]: ${this.state.interviewAnswers}` : "");
        this.switchStep(3);
    },

    async generateArticle() {
        const apiKey = this.apiKeyInput.value.trim();
        if(!apiKey) return alert("Musisz najpierw podać klucz API Gemini!");

        this.aiLoading.classList.remove('hidden');
        this.aiOutput.classList.add('hidden');

        const cat = document.getElementById('evtCategory').value;
        const notes = this.finalNotes.value;
        const prompt = Gemini.getPromptTemplate(cat, notes);

        try {
            const aiJson = await Gemini.callGemini(apiKey, prompt);
            this.state.aiData = aiJson;

            // Obliczenie sugerowanej daty publikacji (Koniec wydarzenia + 3 godziny)
            const endVal = document.getElementById('evtEnd').value;
            let pubDate = new Date();
            if(endVal) {
                pubDate = new Date(endVal);
                pubDate.setHours(pubDate.getHours() + 3);
            }
            
            this.sugDate.innerText = pubDate.toLocaleString('pl-PL');
            this.sugTags.innerText = aiJson.tags ? aiJson.tags.join(', ') : 'brak';

            // Generowanie kodu Gutenberga przeplatanego zasobami WebP
            const finalGutenbergHTML = Gutenberg.generateBlockCode(aiJson, Compressor.processedFiles);
            this.gutenbergOutput.value = finalGutenbergHTML;

            this.aiLoading.classList.add('hidden');
            this.aiOutput.classList.remove('hidden');
        } catch (error) {
            this.aiLoading.classList.add('hidden');
            alert("Błąd podczas kontaktu z AI: " + error.message);
        }
    },

    copyToClipboard() {
        this.gutenbergOutput.select();
        document.execCommand('copy');
        alert('Skopiowano kod bloku WordPress Gutenberg! Możesz go wkleić bezpośrednio w edytorze kodu WP.');
    }
};

window.addEventListener('DOMContentLoaded', () => App.init());