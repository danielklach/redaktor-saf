import { Gemini } from './gemini.js';
import { I18n } from './i18n.js';
import { PhotoDb } from './photoDb.js';

// Redaktor Social Media (v1.12.0) - odpowiednik trybu automatycznego z głównej aplikacji (patrz
// js/app.js), ale znacznie okrojony: bez zdjęć/Compressor/Gutenberg (IG/FB przyjmują zdjęcia w
// dowolnym formacie wprost z telefonu - ten krok jest tu całkowicie zbędny) i bez kroku "finalNotes"
// - wywiad AI od razu prowadzi do gotowego wyniku: DWA teksty (Instagram/Facebook).
const KNOWN_DYNAMIC_STRINGS = [
    'BŁĄD: Musisz najpierw wypełnić WSZYSTKIE pola (nazwa wydarzenia, miejsce, data, kto robił zdjęcia i notatki), aby wygenerować podpisy.',
    '⚠️ Nadal duże obciążenie serwerów Google - próbuję z alternatywnym modelem...',
    '⚠️ Serwery Google są mocno obciążone - ponawiam próbę',
    'Gotowe!',
    'Nie udało się połączyć z AI',
    'Czy chcesz samodzielnie dodać jakieś kluczowe szczegóły, o których zapomniałeś w notatkach?',
    'Agent nie ma dodatkowych pytań - możesz przejść dalej.',
    'Twoja odpowiedź (opcjonalnie)...',
    'Agent analizuje wpisane dane...', 'Szuka wątków wartych dopytania...', 'Formułuje pytania pomocnicze...',
    'Analizuję notatki...', 'Dobieram styl pod social media...', 'Piszę podpis na Instagram...', 'Piszę podpis na Facebook...',
    'Nie udało się połączyć z wbudowanym AI',
    'Możesz skopiować kompletny prompt poniżej i wkleić go do dowolnego zewnętrznego czatu AI (np. ChatGPT, Claude, Gemini) - wynik będzie odpowiadał temu, co wygenerowałby Redaktor Social Media.',
    'Skopiowano do schowka!',
    'Opisz proszę, na czym polega problem.',
    'Dzięki za zgłoszenie, zajmę się tym jak najszybciej!',
    'Nie udało się wysłać zgłoszenia:',
    'Czy na pewno chcesz zacząć nowy wpis? Obecne dane i wygenerowana treść zostaną utracone.',
    'Możesz zacząć pisać nowy wpis!',
    'Zmiana języka odświeży stronę - obecne dane i wygenerowana treść zostaną utracone. Kontynuować?',
    'Sprawdzam bazę fotografów...',
    'Nie podano żadnych fotografów.',
    'Baza jednostek jest jeszcze pusta - możesz dodać wpisy w "Baza fotografów" w nagłówku.',
    'uchwyt na Instagramie (bez @)',
    'Brak Instagrama',
    'Wczytywanie...',
    'Nie udało się wczytać listy:',
    'Baza jest jeszcze pusta.',
    'brak Instagrama',
    'Dodano do bazy!',
    'Podaj imię i nazwisko.',
    'Nie udało się zapisać:',
    'Podaj nazwę jednostki.'
];

const SocialApp = {
    state: {
        currentStep: 'step1',
        interviewAnswers: '',
        captionsData: null,
        // {photographers: [{name, handle}], units: [{name, handle}]} - ustawiane w confirmTagsAndGenerate.
        resolvedTags: null,
        lang: localStorage.getItem('saf_lang') || 'pl'
    },

    init() {
        this.cacheDOM();
        this.bindEvents();
        this.switchStep('step1');
        this.footerYear.textContent = new Date().getFullYear();
        this.renderFooterVersion();
        this.applyLangButtonUI();
        this.initLanguage();
        if (!localStorage.getItem('saf_social_intro_seen')) {
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

        this.btnShowPhotoDb = document.getElementById('btnShowPhotoDb');
        this.photoDbModal = document.getElementById('photoDbModal');
        this.photoDbPhotographersList = document.getElementById('photoDbPhotographersList');
        this.photoDbUnitsList = document.getElementById('photoDbUnitsList');
        this.newPhotographerName = document.getElementById('newPhotographerName');
        this.newPhotographerHandle = document.getElementById('newPhotographerHandle');
        this.btnAddPhotographer = document.getElementById('btnAddPhotographer');
        this.newUnitName = document.getElementById('newUnitName');
        this.newUnitHandle = document.getElementById('newUnitHandle');
        this.newUnitKeywords = document.getElementById('newUnitKeywords');
        this.btnAddUnit = document.getElementById('btnAddUnit');
        this.btnClosePhotoDb = document.getElementById('btnClosePhotoDb');

        this.btnLangSwitch = document.getElementById('btnLangSwitch');
        this.flagEn = this.btnLangSwitch.querySelector('.flag-en');
        this.flagPl = this.btnLangSwitch.querySelector('.flag-pl');
        this.langCode = this.btnLangSwitch.querySelector('.lang-code');

        this.evtNotes = document.getElementById('evtNotes');
        this.evtExternalArticle = document.getElementById('evtExternalArticle');
        this.evtDate = document.getElementById('evtDate');
        this.evtPhotographers = document.getElementById('evtPhotographers');
        this.evtTitle = document.getElementById('evtTitle');
        this.evtLocation = document.getElementById('evtLocation');
        this.btnGenerateSocial = document.getElementById('btnGenerateSocial');

        this.photographerTagsContainer = document.getElementById('photographerTagsContainer');
        this.unitsChecklistContainer = document.getElementById('unitsChecklistContainer');
        this.btnBackToStep1FromTags = document.getElementById('btnBackToStep1FromTags');
        this.btnConfirmTags = document.getElementById('btnConfirmTags');

        this.aiModal = document.getElementById('aiModal');
        this.aiProgressWrap = document.getElementById('aiProgressWrap');
        this.aiProgressBar = document.getElementById('aiProgressBar');
        this.aiProgressLabel = document.getElementById('aiProgressLabel');
        this.aiRetryNotice = document.getElementById('aiRetryNotice');
        this.aiQuestionsContainer = document.getElementById('aiQuestionsContainer');
        this.btnSkipModal = document.getElementById('btnSkipModal');
        this.btnSubmitModal = document.getElementById('btnSubmitModal');

        this.socialLoading = document.getElementById('socialLoading');
        this.genProgressBar = document.getElementById('genProgressBar');
        this.genProgressLabel = document.getElementById('genProgressLabel');
        this.genRetryNotice = document.getElementById('genRetryNotice');
        this.socialFallback = document.getElementById('socialFallback');
        this.socialFallbackMessage = document.getElementById('socialFallbackMessage');
        this.btnCopyFallbackPrompt = document.getElementById('btnCopyFallbackPrompt');
        this.socialOutput = document.getElementById('socialOutput');
        this.instagramOutput = document.getElementById('instagramOutput');
        this.facebookOutput = document.getElementById('facebookOutput');
        this.btnCopyInstagram = document.getElementById('btnCopyInstagram');
        this.btnCopyFacebook = document.getElementById('btnCopyFacebook');
        this.btnCopyExternalPromptSocial = document.getElementById('btnCopyExternalPromptSocial');
        this.btnBackToStep2 = document.getElementById('btnBackToStep2');
        this.btnRegenerateSocial = document.getElementById('btnRegenerateSocial');
        this.btnStartNewSocial = document.getElementById('btnStartNewSocial');

        this.footerYear = document.getElementById('footerYear');
        this.footerVersion = document.getElementById('footerVersion');
    },

    bindEvents() {
        this.logoHome.addEventListener('click', (e) => {
            e.preventDefault();
            location.reload();
        });

        this.btnShowIntro.addEventListener('click', () => this.introModal.classList.remove('hidden'));
        this.btnCloseIntro.addEventListener('click', () => {
            this.introModal.classList.add('hidden');
            localStorage.setItem('saf_social_intro_seen', '1');
        });

        this.btnReportIssue.addEventListener('click', () => {
            this.reportModal.classList.remove('hidden');
            this.reportFallbackEmail.classList.add('hidden');
        });
        this.btnCancelReport.addEventListener('click', () => this.reportModal.classList.add('hidden'));
        this.btnSendReport.addEventListener('click', () => this.sendReport());
        this.btnReportFallback.addEventListener('click', (e) => {
            e.preventDefault();
            this.reportFallbackEmail.classList.toggle('hidden');
        });

        this.btnShowPhotoDb.addEventListener('click', () => this.openPhotoDbModal());
        this.btnClosePhotoDb.addEventListener('click', () => this.photoDbModal.classList.add('hidden'));
        this.btnAddPhotographer.addEventListener('click', () => this.addPhotographerFromModal());
        this.btnAddUnit.addEventListener('click', () => this.addUnitFromModal());

        this.btnLangSwitch.addEventListener('click', () => this.switchLanguage(this.state.lang === 'pl' ? 'en' : 'pl'));

        this.btnGenerateSocial.addEventListener('click', () => this.handleStep1Submit());
        this.btnSubmitModal.addEventListener('click', () => this.closeModal(true));
        this.btnSkipModal.addEventListener('click', () => {
            this._interviewAbortController?.abort();
            this.closeModal(false);
        });

        this.btnBackToStep1FromTags.addEventListener('click', () => this.switchStep('step1'));
        this.btnConfirmTags.addEventListener('click', () => this.confirmTagsAndGenerate());

        this.btnBackToStep2.addEventListener('click', () => {
            this._captionsAbortController?.abort();
            this.switchStep('step2');
        });
        this.btnRegenerateSocial.addEventListener('click', () => this.generateCaptions());
        this.btnStartNewSocial.addEventListener('click', () => this.startNewPost());

        this.btnCopyInstagram.addEventListener('click', () => this.copyField(this.instagramOutput));
        this.btnCopyFacebook.addEventListener('click', () => this.copyField(this.facebookOutput));
        this.btnCopyExternalPromptSocial.addEventListener('click', () => this.copyExternalPrompt());
        this.btnCopyFallbackPrompt.addEventListener('click', () => this.copyExternalPrompt());
    },

    switchStep(step) {
        this.state.currentStep = step;
        document.querySelectorAll('.step-section').forEach(s => { s.style.display = 'none'; s.classList.remove('active'); });
        document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));

        const targetSection = document.getElementById(step);
        if (targetSection) { targetSection.style.display = 'block'; targetSection.classList.add('active'); }

        const targetIndicator = document.querySelector(`.step[data-step="${step}"]`);
        if (targetIndicator) { targetIndicator.classList.add('active'); }
    },

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

    showRetryNotice(noticeEl, message) {
        noticeEl.textContent = message;
        noticeEl.classList.remove('hidden');
    },

    hideRetryNotice(noticeEl) {
        noticeEl.classList.add('hidden');
    },

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

    async handleStep1Submit() {
        const title = this.evtTitle.value.trim();
        const loc = this.evtLocation.value.trim();
        const date = this.evtDate.value;
        const photographers = this.evtPhotographers.value.trim();
        const notes = this.evtNotes.value.trim();

        if (!title || !loc || !date || !photographers || !notes) {
            alert(this.t("BŁĄD: Musisz najpierw wypełnić WSZYSTKIE pola (nazwa wydarzenia, miejsce, data, kto robił zdjęcia i notatki), aby wygenerować podpisy."));
            return;
        }

        this.aiModal.classList.remove('hidden');
        this.btnSubmitModal.disabled = true;
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
            const questions = await Gemini.askForMissingSocialDetails(title, loc, date, photographers, notes, {
                signal,
                onRetry: (attempt, maxAttempts, isFallback) => this.showRetryNotice(
                    this.aiRetryNotice,
                    isFallback
                        ? this.t('⚠️ Nadal duże obciążenie serwerów Google - próbuję z alternatywnym modelem...')
                        : `${this.t('⚠️ Serwery Google są mocno obciążone - ponawiam próbę')} (${attempt}/${maxAttempts})...`
                )
            });
            progress.finish(this.t("Gotowe!"));
            const displayQuestions = await this.translateForDisplay(questions);
            this.renderQuestions(questions, displayQuestions);
        } catch (error) {
            progress.stop();
            if (error.name === 'AbortError') return;
            this.renderQuestions([
                `${this.t('Nie udało się połączyć z AI')} (${error.message}). ${this.t('Czy chcesz samodzielnie dodać jakieś kluczowe szczegóły, o których zapomniałeś w notatkach?')}`
            ]);
        } finally {
            this.hideRetryNotice(this.aiRetryNotice);
        }

        this.btnSubmitModal.disabled = false;
    },

    // W przeciwieństwie do WordPressa (closeModal -> switchStep('step2') na zdjęcia), tutaj nie ma
    // kroku zdjęć - zamknięcie modala prowadzi do Kroku 2 "Potwierdź oznaczenia" (patrz
    // showTagsStep), a dopiero STAMTĄD (po potwierdzeniu uchwytów/jednostek) generujemy podpisy.
    closeModal(saveData) {
        if (saveData) {
            const answers = [];
            this.aiQuestionsContainer.querySelectorAll('.question-answer').forEach(ta => {
                const val = ta.value.trim();
                if (val) answers.push(`Pytanie: ${ta.dataset.question}\nOdpowiedź: ${val}`);
            });
            this.state.interviewAnswers = answers.join('\n\n');
        } else {
            this.state.interviewAnswers = "";
        }
        this.aiModal.classList.add('hidden');
        this.showTagsStep();
    },

    // Krok 2 "Potwierdź oznaczenia": rozdziela pole "Kto robił zdjęcia" na pojedyncze osoby, próbuje
    // dopasować każdą do bazy (dokładnie, potem przez Gemini.matchPhotographerName dla zdrobnień/
    // literówek - patrz js/gemini.js) i renderuje edytowalną tabelę uchwytów, oraz checklistę
    // jednostek z automatycznymi podpowiedziami wg słów kluczowych znalezionych w notatkach.
    async showTagsStep() {
        this.switchStep('step2');
        this.photographerTagsContainer.innerHTML = `<p class="info-text">${this.t('Sprawdzam bazę fotografów...')}</p>`;
        this.unitsChecklistContainer.innerHTML = '';

        const typedNames = this.evtPhotographers.value.split(',').map((s) => s.trim()).filter(Boolean);

        let knownPhotographers = [];
        let knownUnits = [];
        try {
            knownPhotographers = await PhotoDb.getPhotographers();
        } catch (error) {
            console.warn('[PhotoDb] Nie udało się pobrać listy fotografów (działam bez sugestii):', error.message);
        }
        try {
            knownUnits = await PhotoDb.getUnits();
        } catch (error) {
            console.warn('[PhotoDb] Nie udało się pobrać listy jednostek (działam bez sugestii):', error.message);
        }
        this._knownUnits = knownUnits;

        await this.renderPhotographerTags(typedNames, knownPhotographers);
        this.renderUnitsChecklist(knownUnits);
    },

    async renderPhotographerTags(typedNames, knownPhotographers) {
        if (typedNames.length === 0) {
            this.photographerTagsContainer.innerHTML = `<p class="info-text">${this.t('Nie podano żadnych fotografów.')}</p>`;
            this._resolvedPhotographers = [];
            return;
        }

        const findExact = (name) => knownPhotographers.find((p) =>
            p.name.toLowerCase() === name.toLowerCase()
            || (p.altNames || []).some((alt) => alt.toLowerCase() === name.toLowerCase())
        );

        const rows = [];
        for (const typedName of typedNames) {
            const exact = findExact(typedName);
            let resolvedName = typedName;
            let handle = '';

            if (exact) {
                resolvedName = exact.name;
                handle = exact.handle || '';
            } else if (knownPhotographers.length > 0) {
                try {
                    const { match } = await Gemini.matchPhotographerName(typedName, knownPhotographers.map((p) => p.name));
                    if (match) {
                        const fuzzy = knownPhotographers.find((p) => p.name === match);
                        resolvedName = fuzzy.name;
                        handle = fuzzy.handle || '';
                    }
                } catch (error) {
                    console.warn('[PhotoDb] Dopasowanie nazwiska nie powiodło się:', error.message);
                }
            }

            // Jeśli baza już zna tę osobę i ma zapisane PUSTE pole uchwytu, to wcześniej
            // potwierdzone "brak Instagrama" - odznacz pole domyślnie w tym jednym przypadku.
            const confirmedNoHandle = !!exact && !exact.handle;
            rows.push({ typedName, resolvedName, handle, noInstagram: confirmedNoHandle });
        }

        this._resolvedPhotographers = rows;
        this.renderPhotographerRows();
    },

    renderPhotographerRows() {
        this.photographerTagsContainer.innerHTML = '';
        this._resolvedPhotographers.forEach((row, idx) => {
            const wrap = document.createElement('div');
            wrap.style.cssText = 'display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid var(--border); flex-wrap:wrap;';
            wrap.innerHTML = `
                <span style="min-width:160px; font-weight:600;">${row.resolvedName}</span>
                <input type="text" class="photographer-handle-input" data-idx="${idx}" placeholder="${this.t('uchwyt na Instagramie (bez @)')}" value="${row.handle || ''}" style="flex:1 1 160px;" ${row.noInstagram ? 'disabled' : ''}>
                <label style="display:flex; align-items:center; gap:6px; white-space:nowrap;">
                    <input type="checkbox" class="photographer-no-ig-checkbox" data-idx="${idx}" ${row.noInstagram ? 'checked' : ''}>
                    ${this.t('Brak Instagrama')}
                </label>
            `;
            this.photographerTagsContainer.appendChild(wrap);
        });

        this.photographerTagsContainer.querySelectorAll('.photographer-handle-input').forEach((input) => {
            input.addEventListener('input', (e) => {
                this._resolvedPhotographers[Number(e.target.dataset.idx)].handle = e.target.value.trim();
            });
        });
        this.photographerTagsContainer.querySelectorAll('.photographer-no-ig-checkbox').forEach((cb) => {
            cb.addEventListener('change', (e) => {
                const idx = Number(e.target.dataset.idx);
                this._resolvedPhotographers[idx].noInstagram = e.target.checked;
                const input = this.photographerTagsContainer.querySelector(`.photographer-handle-input[data-idx="${idx}"]`);
                input.disabled = e.target.checked;
                if (e.target.checked) {
                    input.value = '';
                    this._resolvedPhotographers[idx].handle = '';
                }
            });
        });
    },

    // Proste dopasowanie podciągu (case-insensitive) słów kluczowych jednostki wobec tytułu/miejsca/
    // notatek - jeśli trafi, jednostka jest domyślnie zaznaczona (użytkownik może to zmienić).
    renderUnitsChecklist(knownUnits) {
        this.unitsChecklistContainer.innerHTML = '';
        if (!knownUnits || knownUnits.length === 0) {
            this.unitsChecklistContainer.innerHTML = `<p class="info-text">${this.t('Baza jednostek jest jeszcze pusta - możesz dodać wpisy w "Baza fotografów" w nagłówku.')}</p>`;
            return;
        }

        const haystack = `${this.evtTitle.value} ${this.evtLocation.value} ${this.evtNotes.value}`.toLowerCase();

        knownUnits.forEach((unit, idx) => {
            const suggested = (unit.keywords || []).some((kw) => kw && haystack.includes(kw.toLowerCase()));
            const label = document.createElement('label');
            label.style.cssText = 'display:flex; align-items:center; gap:8px; padding:6px 0;';
            label.innerHTML = `<input type="checkbox" class="unit-checkbox" data-idx="${idx}" ${suggested ? 'checked' : ''}> ${unit.name}${unit.handle ? ` (@${unit.handle})` : ''}`;
            this.unitsChecklistContainer.appendChild(label);
        });
    },

    // Zapisuje nowe/zmienione wpisy fotografów w bazie (fire-and-forget - błąd zapisu NIE blokuje
    // przejścia dalej, patrz architektura "fail-open" w js/photoDb.js), buduje finalną listę
    // {name, handle|null} dla fotografów i zaznaczonych jednostek, i dopiero TERAZ generuje podpisy.
    confirmTagsAndGenerate() {
        (this._resolvedPhotographers || []).forEach((row) => {
            PhotoDb.upsertPhotographer({
                name: row.resolvedName,
                handle: row.noInstagram ? '' : row.handle,
                altNames: row.resolvedName !== row.typedName ? [row.typedName] : undefined
            }).catch((error) => console.warn('[PhotoDb] Nie udało się zapisać fotografa:', error.message));
        });

        const photographers = (this._resolvedPhotographers || []).map((row) => ({
            name: row.resolvedName,
            handle: row.noInstagram ? null : (row.handle || null)
        }));

        const selectedIdxs = Array.from(this.unitsChecklistContainer.querySelectorAll('.unit-checkbox:checked')).map((cb) => Number(cb.dataset.idx));
        const units = selectedIdxs.map((idx) => this._knownUnits[idx]).map((u) => ({ name: u.name, handle: u.handle || null }));

        this.state.resolvedTags = { photographers, units };
        this.switchStep('step3');
        this.generateCaptions();
    },

    // --- "Baza fotografów" (modal dostępny z nagłówka w każdej chwili) ---

    async openPhotoDbModal() {
        this.photoDbModal.classList.remove('hidden');
        await this.refreshPhotoDbLists();
    },

    async refreshPhotoDbLists() {
        this.photoDbPhotographersList.innerHTML = `<p class="info-text">${this.t('Wczytywanie...')}</p>`;
        this.photoDbUnitsList.innerHTML = `<p class="info-text">${this.t('Wczytywanie...')}</p>`;

        try {
            const photographers = await PhotoDb.getPhotographers();
            this.photoDbPhotographersList.innerHTML = photographers.length
                ? photographers.map((p) => `<div style="padding:4px 0;">${p.name}${p.handle ? ` - @${p.handle}` : ` (${this.t('brak Instagrama')})`}</div>`).join('')
                : `<p class="info-text">${this.t('Baza jest jeszcze pusta.')}</p>`;
        } catch (error) {
            this.photoDbPhotographersList.innerHTML = `<p class="info-text">${this.t('Nie udało się wczytać listy:')} ${error.message}</p>`;
        }

        try {
            const units = await PhotoDb.getUnits();
            this.photoDbUnitsList.innerHTML = units.length
                ? units.map((u) => `<div style="padding:4px 0;">${u.name}${u.handle ? ` - @${u.handle}` : ''}${(u.keywords || []).length ? ` <span style="color:var(--text-muted); font-size:0.85rem;">(${u.keywords.join(', ')})</span>` : ''}</div>`).join('')
                : `<p class="info-text">${this.t('Baza jest jeszcze pusta.')}</p>`;
        } catch (error) {
            this.photoDbUnitsList.innerHTML = `<p class="info-text">${this.t('Nie udało się wczytać listy:')} ${error.message}</p>`;
        }
    },

    async addPhotographerFromModal() {
        const name = this.newPhotographerName.value.trim();
        const handle = this.newPhotographerHandle.value.trim().replace(/^@/, '');
        if (!name) {
            alert(this.t('Podaj imię i nazwisko.'));
            return;
        }
        try {
            await PhotoDb.upsertPhotographer({ name, handle });
            this.newPhotographerName.value = '';
            this.newPhotographerHandle.value = '';
            this.showToast(this.t('Dodano do bazy!'));
            await this.refreshPhotoDbLists();
        } catch (error) {
            alert(this.t('Nie udało się zapisać:') + ' ' + error.message);
        }
    },

    async addUnitFromModal() {
        const name = this.newUnitName.value.trim();
        const handle = this.newUnitHandle.value.trim().replace(/^@/, '');
        const keywords = this.newUnitKeywords.value.split(',').map((s) => s.trim()).filter(Boolean);
        if (!name) {
            alert(this.t('Podaj nazwę jednostki.'));
            return;
        }
        try {
            await PhotoDb.upsertUnit({ name, handle, keywords });
            this.newUnitName.value = '';
            this.newUnitHandle.value = '';
            this.newUnitKeywords.value = '';
            this.showToast(this.t('Dodano do bazy!'));
            await this.refreshPhotoDbLists();
        } catch (error) {
            alert(this.t('Nie udało się zapisać:') + ' ' + error.message);
        }
    },

    // Odpowiednik goToStep3()+generateArticle() z WordPressa, ale bez zdjęć/linków/kategorii -
    // kompiluje notatki i od razu woła Gemini.generateSocialCaptions.
    compileNotes() {
        let compiledInformation = "";
        compiledInformation += `Wydarzenie: ${this.evtTitle.value}\n`;
        compiledInformation += `Miejsce: ${this.evtLocation.value}\n`;
        compiledInformation += `Data: ${this.evtDate.value}\n`;
        compiledInformation += `Kto robił zdjęcia: ${this.evtPhotographers.value}\n\n`;

        compiledInformation += `Główne notatki autora:\n${this.evtNotes.value}\n`;

        if (this.state.interviewAnswers) {
            compiledInformation += `\nDodatkowe szczegóły uzyskane z wywiadu z AI:\n${this.state.interviewAnswers}`;
        }

        const externalArticle = this.evtExternalArticle?.value.trim();
        if (externalArticle) {
            compiledInformation += `\n\n=== WCZEŚNIEJSZY ARTYKUŁ O TYM WYDARZENIU (Z ZEWNĘTRZNEGO PORTALU LUB WCZEŚNIEJSZY WPIS SAF JAMNIK - TYLKO DO INSPIRACJI FAKTOGRAFICZNEJ, NIE KOPIUJ ZDAŃ ANI STYLU) ===\n${externalArticle}`;
        }

        return compiledInformation;
    },

    setResultState(mode) {
        this.socialLoading.classList.toggle('hidden', mode !== 'loading');
        this.socialFallback.classList.toggle('hidden', mode !== 'fallback');
        this.socialOutput.classList.toggle('hidden', mode !== 'output');
        this.btnRegenerateSocial.classList.toggle('hidden', mode !== 'output');
    },

    async generateCaptions() {
        this.setResultState('loading');
        this._notes = this.compileNotes();

        this._captionsAbortController = new AbortController();
        const { signal } = this._captionsAbortController;

        const progress = this.startProgressSimulation(
            this.genProgressBar,
            this.genProgressLabel,
            [],
            [
                this.t("Analizuję notatki..."),
                this.t("Dobieram styl pod social media..."),
                this.t("Piszę podpis na Instagram..."),
                this.t("Piszę podpis na Facebook...")
            ],
            9000
        );

        try {
            const captions = await Gemini.generateSocialCaptions(this._notes, this.state.resolvedTags, {
                signal,
                onRetry: (attempt, maxAttempts, isFallback) => this.showRetryNotice(
                    this.genRetryNotice,
                    isFallback
                        ? this.t('⚠️ Nadal duże obciążenie serwerów Google - próbuję z alternatywnym modelem...')
                        : `${this.t('⚠️ Serwery Google są mocno obciążone - ponawiam próbę')} (${attempt}/${maxAttempts})...`
                )
            });
            progress.finish(this.t("Gotowe!"));

            this.state.captionsData = captions;
            this.instagramOutput.value = captions.instagram;
            this.facebookOutput.value = captions.facebook;
            this.setResultState('output');
        } catch (error) {
            progress.stop();
            if (error.name === 'AbortError') return;
            this.socialFallbackMessage.textContent = `${this.t('Nie udało się połączyć z wbudowanym AI')} (${error.message}). ${this.t('Możesz skopiować kompletny prompt poniżej i wkleić go do dowolnego zewnętrznego czatu AI (np. ChatGPT, Claude, Gemini) - wynik będzie odpowiadał temu, co wygenerowałby Redaktor Social Media.')}`;
            this.setResultState('fallback');
        } finally {
            this.hideRetryNotice(this.genRetryNotice);
        }
    },

    buildExternalPromptText() {
        const notes = this._notes || this.compileNotes();
        return Gemini.buildExternalSocialPrompt(notes, this.state.resolvedTags);
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

    async copyField(el) {
        const text = el.value;
        try {
            await navigator.clipboard.writeText(text);
        } catch (e) {
            el.select();
            document.execCommand('copy');
        }
        this.showToast(this.t('Skopiowano do schowka!'));
    },

    hasUnsavedContent() {
        return !!(this.evtTitle.value || this.evtNotes.value || this.evtExternalArticle.value
            || this.evtPhotographers.value || this.state.captionsData);
    },

    resetAllFormState() {
        this._interviewAbortController?.abort();
        this._captionsAbortController?.abort();

        this.evtTitle.value = '';
        this.evtLocation.value = '';
        this.evtDate.value = '';
        this.evtPhotographers.value = '';
        this.evtNotes.value = '';
        this.evtExternalArticle.value = '';

        this.state.interviewAnswers = '';
        this.state.captionsData = null;
        this.state.resolvedTags = null;
        this._notes = null;
        this._resolvedPhotographers = null;
        this._knownUnits = null;
        this.instagramOutput.value = '';
        this.facebookOutput.value = '';
        this.setResultState('loading');
    },

    startNewPost() {
        if (this.hasUnsavedContent() && !window.confirm(this.t('Czy na pewno chcesz zacząć nowy wpis? Obecne dane i wygenerowana treść zostaną utracone.'))) {
            return;
        }
        this.resetAllFormState();
        this.switchStep('step1');
        this.showToast(this.t('Możesz zacząć pisać nowy wpis!'));
    },

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

    // --- i18n (PL/EN) - identyczny mechanizm co w js/app.js, reużywa js/i18n.js 1:1 ---

    async switchLanguage(lang) {
        if (lang === this.state.lang) return;

        if (this.hasUnsavedContent() && !window.confirm(this.t('Zmiana języka odświeży stronę - obecne dane i wygenerowana treść zostaną utracone. Kontynuować?'))) {
            return;
        }

        if (lang === 'pl') {
            localStorage.setItem('saf_lang', 'pl');
            location.reload();
            return;
        }

        this.btnLangSwitch.disabled = true;
        document.documentElement.classList.add('lang-loading');
        try {
            await I18n.ensureReady(KNOWN_DYNAMIC_STRINGS);
        } catch (error) {
            document.documentElement.classList.remove('lang-loading');
            this.btnLangSwitch.disabled = false;
            alert('Sorry, this function is temporarily unavailable.');
            return;
        }
        localStorage.setItem('saf_lang', 'en');
        location.reload();
    },

    applyLangButtonUI() {
        const switchingToEn = this.state.lang === 'pl';
        this.flagEn.classList.toggle('hidden', !switchingToEn);
        this.flagPl.classList.toggle('hidden', switchingToEn);
        this.langCode.textContent = switchingToEn ? 'EN' : 'PL';
    },

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

    async translateForDisplay(strings) {
        if (this.state.lang === 'pl' || !strings || strings.length === 0) return strings;
        try {
            return await Gemini.translateStrings(strings);
        } catch (error) {
            console.warn('[i18n] Nie udało się przetłumaczyć pytań agenta na żywo:', error.message);
            return strings;
        }
    }
};

window.addEventListener('DOMContentLoaded', () => SocialApp.init());
