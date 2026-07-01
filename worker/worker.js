const ALLOWED_ORIGIN = "https://danielklach.github.io";

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

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;

        try {
            const geminiRes = await fetch(geminiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    ...(generationConfig ? { generationConfig } : {})
                })
            });

            const data = await geminiRes.json();

            if (!geminiRes.ok) {
                let message = data.error?.message || "Błąd Gemini API";
                // Ten konkretny błąd Google (403/PERMISSION_DENIED) oznacza, że klucz w sekrecie
                // GEMINI_API_KEY jest nieprawidłowy, nieaktywny, albo ma ustawione "Website restrictions"
                // (które blokują wywołania spoza przeglądarki - a Worker woła Gemini z serwera).
                if (data.error?.status === "PERMISSION_DENIED" || /unregistered callers/i.test(message)) {
                    message += " [Sprawdź: 1) czy GEMINI_API_KEY w ustawieniach Workera to prawdziwy klucz z aistudio.google.com/apikey (zaczyna się od 'AIzaSy'), 2) czy w Google AI Studio / Cloud Console ten klucz NIE ma ustawionych 'Website restrictions' - serwer Workera nie wysyła nagłówka Referer, więc taki klucz zostanie odrzucony.]";
                }
                return jsonResponse({ error: message }, geminiRes.status);
            }

            return jsonResponse(data, 200);
        } catch (err) {
            return jsonResponse({ error: "Nie udało się połączyć z Gemini API: " + err.message }, 502);
        }
    }
};

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