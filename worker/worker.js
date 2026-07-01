const ALLOWED_ORIGIN = "https://danielklach.github.io";

// Adres, na który trafiają anonimowe zgłoszenia usterek z przycisku "Zgłoś problem".
const REPORT_TO_EMAIL = "webmaster@klachphoto.com";
// Resend (resend.com) pozwala wysyłać z tego adresu bez weryfikacji własnej domeny - do zmiany
// na "zgloszenia@twojadomena.pl", jeśli w Resend zweryfikujesz własną domenę.
const REPORT_FROM_EMAIL = "Redaktor SAF <onboarding@resend.dev>";

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

        // Zgłoszenia usterek ("Zgłoś problem" w interfejsie) idą innym torem niż prompty do Gemini -
        // użytkownik nic sam nie wysyła, Worker anonimowo przekazuje treść na maila webmastera.
        if (body.type === "report") {
            return handleIssueReport(body, env);
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

// Wysyła zgłoszenie usterki na maila webmastera przez Resend (resend.com).
// Wymaga sekretu RESEND_API_KEY ustawionego w Cloudflare (tak samo jak GEMINI_API_KEY) -
// darmowe konto Resend wystarcza w zupełności na ten cel. Zgłoszenie jest anonimowe:
// front-end nie wysyła żadnych danych identyfikujących użytkownika (patrz js/gemini.js).
async function handleIssueReport(body, env) {
    const category = typeof body.category === "string" ? body.category.slice(0, 200) : "Inne";
    const description = typeof body.description === "string" ? body.description.trim().slice(0, 5000) : "";
    if (!description) {
        return jsonResponse({ error: "Brak opisu problemu w zgłoszeniu" }, 400);
    }

    const resendKey = (env.RESEND_API_KEY || "").trim();
    if (!resendKey) {
        return jsonResponse({ error: "Worker nie ma skonfigurowanego sekretu RESEND_API_KEY" }, 500);
    }

    try {
        const resendRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${resendKey}`
            },
            body: JSON.stringify({
                from: REPORT_FROM_EMAIL,
                to: [REPORT_TO_EMAIL],
                subject: `[Redaktor SAF] Zgłoszenie problemu: ${category}`,
                text: `Kategoria: ${category}\n\nOpis problemu:\n${description}\n\n---\nAnonimowe zgłoszenie wysłane automatycznie z Redaktora SAF Jamnik.`
            })
        });

        if (!resendRes.ok) {
            const errData = await resendRes.json().catch(() => ({}));
            return jsonResponse({ error: errData.message || "Nie udało się wysłać zgłoszenia" }, resendRes.status);
        }

        return jsonResponse({ ok: true }, 200);
    } catch (err) {
        return jsonResponse({ error: "Nie udało się połączyć z serwerem pocztowym: " + err.message }, 502);
    }
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