function readApiKey() {
  const key = String(process.env.POLLINATIONS_API_KEY || process.env.POLLINATIONS_KEY || "").trim();
  return key;
}

function extractJsonFromText(text) {
  const raw = String(text || "").trim();
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    // If model wraps JSON in text, try best-effort extraction.
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const candidate = raw.slice(start, end + 1);
      try {
        return JSON.parse(candidate);
      } catch {
        return null;
      }
    }
  }

  return null;
}

async function callPollinationsChat(messages, model = "mistral") {
  const apiKey = readApiKey();
  const headers = {
    "Content-Type": "application/json",
  };

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch("https://text.pollinations.ai/openai", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Pollinations chat HTTP ${response.status}: ${errText.slice(0, 300)}`);
  }

  const payload = await response.json();
  const content = String(payload?.choices?.[0]?.message?.content || "").trim();
  return { payload, content };
}

async function runAnalyserCv(cvText) {
  if (!String(cvText || "").trim()) {
    throw new Error("cvText est requis pour l'action analyser_cv.");
  }

  const messages = [
    {
      role: "system",
      content:
        'Tu es un expert en recrutement. Retourne uniquement un JSON strict au format {"questions":[{"text":"...","hint":"..."}]} avec 5 questions max, en francais.',
    },
    {
      role: "user",
      content: `Analyse ce CV et propose des questions: ${cvText}`,
    },
  ];

  const { content } = await callPollinationsChat(messages, "mistral");
  const parsed = extractJsonFromText(content);

  if (parsed) {
    return parsed;
  }

  return { rawText: content };
}

async function runCalculerScore(questionsEtReponses, offresEmploi) {
  const qr = Array.isArray(questionsEtReponses) ? questionsEtReponses : [];
  const offres = Array.isArray(offresEmploi) ? offresEmploi : [];

  const messages = [
    {
      role: "system",
      content:
        'Tu es un outil de scoring recrutement. Retourne uniquement un JSON strict au format {"resultats":[{"offre_id":"...","score":0,"explication":"..."}]}.',
    },
    {
      role: "user",
      content: `Questions/Reponses: ${JSON.stringify(qr)}\nOffres: ${JSON.stringify(offres)}`,
    },
  ];

  const { content } = await callPollinationsChat(messages, "mistral");
  const parsed = extractJsonFromText(content);

  if (parsed) {
    return parsed;
  }

  return { rawText: content };
}

async function runGenerateProfile(prompt) {
  const safePrompt = String(prompt || "").trim();
  if (!safePrompt) {
    throw new Error("prompt est requis pour l'action generate_profile.");
  }

  const url = `https://image.pollinations.ai/p/${encodeURIComponent(safePrompt)}`;
  return { url };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body || {};
    const action = String(body.action || "").trim().toLowerCase();

    if (!action) {
      return res.status(400).json({ error: "Le champ action est obligatoire." });
    }

    let result;

    if (action === "analyser_cv") {
      result = await runAnalyserCv(body.cvText);
    } else if (action === "calculer_score") {
      result = await runCalculerScore(body.questionsEtReponses, body.offresEmploi);
    } else if (action === "generate_profile" || action === "generer_photo") {
      result = await runGenerateProfile(body.prompt);
    } else {
      return res.status(400).json({ error: "Action non reconnue." });
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("Erreur /api/profily-ai:", error);
    return res.status(500).json({ error: error.message || "Erreur interne." });
  }
}
