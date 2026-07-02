const ALLOWED_ORIGIN = "https://redaktor-safi.netlify.app";

// Modele Gemini do wypróbowania w kolejności - gdy Google wycofa/zmieni pierwszy z nich, Worker
// automatycznie spróbuje kolejnego, zamiast od razu zwracać błąd. Zwiększa to szansę, że aplikacja
// przetrwa aktualizację modelu bez zmiany kodu - ale gdy pojawi się nowszy model, i tak warto
// dopisać go na początku tej listy (jedno miejsce w całym projekcie do zmiany).
const GEMINI_MODELS = ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];

export default {
    async fetch(request, env) {
        if (request.method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders() });
        }

        if (request.method !== "POST") {
            return jsonResponse({ error: "Method not allowed" }, 405);
        }

        let body;
        try {
            body = await request.json();
        } catch {
            return jsonResponse({ error: "Nieprawidłowy JSON w żądaniu" }, 400);
        }

        const { prompt, generationConfig } = body;
        if (!prompt || typeof prompt !== "string") {
            return jsonResponse({ error: "Brak pola 'prompt' w żądaniu" }, 400);
        }

        // .trim() jako siatka bezpieczeństwa: jeśli sekret w Cloudflare został wklejony
        // z niewidoczną spacją/nowym wierszem na końcu, Google i tak odrzuci taki klucz
        // z tym samym, mylącym komunikatem o "unregistered callers".
        const apiKey = (env.GEMINI_API_KEY || "").trim();
        if (!apiKey) {
            return jsonResponse({ error: "Worker nie ma skonfigurowanego sekretu GEMINI_API_KEY" }, 500);
        }

        try {
            return await callGeminiWithFallback(prompt, generationConfig, apiKey);
        } catch (err) {
            return jsonResponse({ error: "Nie udało się połączyć z Gemini API: " + err.message }, 502);
        }
    }
};

// Próbuje kolejnych modeli z GEMINI_MODELS. Do następnego przechodzi TYLKO, jeśli błąd wygląda na
// "ten model już nie istnieje/nie jest wspierany" (404 albo komunikat o nieznanym modelu) - każdy
// inny błąd (zły klucz, przekroczony limit itp.) powtórzyłby się identycznie dla każdego modelu,
// więc nie ma sensu marnować na to czasu i zwracamy go od razu.
async function callGeminiWithFallback(prompt, generationConfig, apiKey) {
    let lastResponse = null;

    for (let i = 0; i < GEMINI_MODELS.length; i++) {
        const model = GEMINI_MODELS[i];
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const geminiRes = await fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                ...(generationConfig ? { generationConfig } : {})
            })
        });

        const data = await geminiRes.json();

        if (geminiRes.ok) {
            return jsonResponse(data, 200);
        }

        lastResponse = { data, status: geminiRes.status };

        const message = data.error?.message || "";
        const isModelIssue = geminiRes.status === 404 || /not found|is not supported|not available/i.test(message);
        const hasNextModel = i < GEMINI_MODELS.length - 1;
        if (isModelIssue && hasNextModel) {
            continue; // ten konkretny model już nie działa - próbujemy następnego z listy
        }
        break;
    }

    let message = lastResponse.data.error?.message || "Błąd Gemini API";
    // Ten konkretny błąd Google (403/PERMISSION_DENIED) oznacza, że klucz w sekrecie
    // GEMINI_API_KEY jest nieprawidłowy, nieaktywny, albo ma ustawione "Website restrictions"
    // (które blokują wywołania spoza przeglądarki - a Worker woła Gemini z serwera).
    if (lastResponse.data.error?.status === "PERMISSION_DENIED" || /unregistered callers/i.test(message)) {
        message += " [Sprawdź: 1) czy GEMINI_API_KEY w ustawieniach Workera to prawdziwy klucz z aistudio.google.com/apikey (zaczyna się od 'AIzaSy'), 2) czy w Google AI Studio / Cloud Console ten klucz NIE ma ustawionych 'Website restrictions' - serwer Workera nie wysyła nagłówka Referer, więc taki klucz zostanie odrzucony.]";
    } else if (lastResponse.status === 404 || /not found|is not supported|not available/i.test(message)) {
        message += " [Wygląda na to, że WSZYSTKIE modele z listy GEMINI_MODELS w worker.js przestały działać - dopisz na początku tej listy aktualną nazwę modelu z ai.google.dev/gemini-api/docs/models.]";
    }
    return jsonResponse({ error: message }, lastResponse.status);
}

function corsHeaders() {
    return {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
    };
}

function jsonResponse(obj, status) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { "Content-Type": "application/json", ...corsHeaders() }
    });
}