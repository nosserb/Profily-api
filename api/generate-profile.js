function safeJsonParse(raw) {
  const text = String(raw || "").trim();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export default async function handler(req, res) {
  // CORS headers for cross-origin requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body || {};
  const action = String(body.action || "").trim().toLowerCase();
  const cvText = String(body.cvText || "").trim();
  const prompt = String(body.prompt || "").trim();

  // Récupération sécurisée des clés secrètes
  const pKey = String(process.env.POLLINATIONS_KEY || process.env.POLLINATIONS_API_KEY || "").trim();
  const ftId = String(process.env.FRANCE_TRAVAIL_CLIENT_ID || "").trim();
  const ftSecret = String(process.env.FRANCE_TRAVAIL_CLIENT_SECRET || "").trim();

  try {
    if (!action) {
      return res.status(400).json({ error: "Le champ action est obligatoire." });
    }

    if (action === "generate_profile" || action === "generer_photo") {
      if (!prompt) {
        return res.status(400).json({ error: "Le champ prompt est obligatoire." });
      }

      return res.status(200).json({
        url: `https://image.pollinations.ai/p/${encodeURIComponent(prompt)}`,
      });
    }

    if (action === "analyser_cv") {
      if (!cvText) {
        return res.status(400).json({ error: "Le champ cvText est obligatoire." });
      }

      // Retry logic for rate limiting
      let response;
      let lastError;
      const maxRetries = 3;
      const baseDelay = 1000;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          response = await fetch("https://gen.pollinations.ai/v1/chat/completions", {
            method: "POST",
            headers: {
              ...(pKey ? { Authorization: `Bearer ${pKey}` } : {}),
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              messages: [
                {
                  role: "system",
                  content:
                    "Tu es un expert en recrutement. Retourne uniquement un JSON strict au format {\"questions\":[{\"text\":\"...\",\"hint\":\"...\"}]} avec 5 questions max.",
                },
                { role: "user", content: `Voici le CV : ${cvText}` },
              ],
              model: "mistral",
              temperature: 0.3,
            }),
          });

          if (response.ok) break;

          const errText = await response.text();
          lastError = errText;

          if (response.status === 429 || response.status === 502) {
            if (attempt < maxRetries - 1) {
              const delay = baseDelay * Math.pow(2, attempt);
              console.log(`Rate limited (${response.status}). Retrying in ${delay}ms...`);
              await new Promise(resolve => setTimeout(resolve, delay));
              continue;
            }
          }
          throw new Error(`HTTP ${response.status}`);
        } catch (error) {
          if (attempt === maxRetries - 1) {
            return res.status(502).json({ error: `Pollinations HTTP ${lastError?.status || error.message}`, details: lastError?.slice?.(0, 500) || error.message });
          }
          const delay = baseDelay * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      const payload = await response.json();
      const content = String(payload?.choices?.[0]?.message?.content || "").trim();
      const parsed = safeJsonParse(content);

      if (parsed) {
        return res.status(200).json(parsed);
      }

      return res.status(200).json({ rawText: content || payload });
    }

    if (action === "calculer_score") {
      return res.status(200).json({
        resultats: [],
        meta: {
          provider: "profily-gateway",
          franceTravailConfigured: Boolean(ftId && ftSecret),
          note: "Action calculer_score prête. Brancher la logique France Travail ici.",
        },
      });
    }

    return res.status(400).json({ error: "Action non reconnue." });
  } catch (error) {
    console.error("Erreur de la passerelle :", error);
    return res.status(500).json({ error: "Erreur lors du traitement des données." });
  }
}