// ============================================================================
// Cloudflare Worker – bezpieczny serwer pośredniczący (proxy) dla Gemini API.
//
// DLACZEGO TO JEST POTRZEBNE:
// Strona "redaktor-saf" jest aplikacją czysto front-endową (HTML/CSS/JS bez
// backendu). Każdy klucz API zaszyty bezpośrednio w plikach JS trafia do
// przeglądarki użytkownika i da się go odczytać w Narzędziach deweloperskich
// albo w zakładce Sieć. Ten Worker rozwiązuje problem: klucz Gemini jest
// przechowywany WYŁĄCZNIE jako zaszyfrowany sekret środowiskowy Workera
// (env.GEMINI_API_KEY) i NIGDY nie trafia do żadnego pliku w repozytorium
// ani do kodu strony.
//
// Strona wysyła zapytanie do TEGO Workera (bez klucza), a Worker doklejuje
// swój sekretny klucz i odpytuje Gemini w Twoim imieniu.
//
// WDROŻENIE (jednorazowo, z terminala w tym folderze):
//   1. npm install -g wrangler
//   2. wrangler login
//   3. wrangler init          (jeśli nie masz jeszcze wrangler.toml w tym folderze)
//   4. wrangler secret put GEMINI_API_KEY
//        -> gdy zapyta o wartość, wklej nowy klucz:
//           AQ.Ab8RN6LSmqXfV6NH-FHgxVHe1wAS4lxKxcts7JKXf4ecSrfFyg
//      (NIE wklejaj klucza do żadnego pliku - tylko do tego polecenia w terminalu)
//   5. wrangler deploy
//   6. Skopiuj adres, który wypisze Wrangler (np.
//      https://saf-jamnik-proxy.twoj-user.workers.dev) i wklej go jako
//      wartość stałej PROXY_URL na górze pliku js/gemini.js
//   7. Poniżej podmień ALLOWED_ORIGIN na domenę, z której faktycznie
//      serwowana jest Twoja strona (np. https://jamnik.uwm.edu.pl albo
//      adres GitHub Pages) - to zabezpieczenie przed używaniem Twojego
//      proxy (i limitu Gemini) przez obce strony.
// ============================================================================

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

        const apiKey = env.GEMINI_API_KEY;
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
                return jsonResponse({ error: data.error?.message || "Błąd Gemini API" }, geminiRes.status);
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