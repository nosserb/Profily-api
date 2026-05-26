export default async function handler(req, res) {
  // On récupère le prompt envoyé par l'utilisateur
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "Le prompt est obligatoire." });
  }

  try {
    // Appel à l'API de Pollinations en injectant la clé secrète stockée sur Vercel
    const response = await fetch("https://image.pollinations.ai/p/" + encodeURIComponent(prompt), {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${process.env.POLLINATIONS_API_KEY}`
      }
    });

    // Si Pollinations renvoie directement l'image ou un JSON, on s'adapte.
    // Généralement, l'API de base de Pollinations renvoie directement l'image ou une URL.
    // Si tu utilises leur endpoint spécifique qui renvoie un JSON :
    const data = await response.json();
    
    return res.status(200).json(data);

  } catch (error) {
    console.error("Erreur Gateway Profily:", error);
    return res.status(500).json({ error: "Erreur lors de la génération du profil." });
  }
}