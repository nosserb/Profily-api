export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const pollinationsKey = process.env.POLLINATIONS_KEY;

  if (!pollinationsKey) {
    return res.status(400).json({
      error: 'Pollinations API key not configured on server',
      message: 'Veuillez configurer POLLINATIONS_KEY dans les variables Vercel',
    });
  }

  return res.status(200).json({
    success: true,
    status: 'connected',
    message: 'Connexion Pollinations établie via serveur',
  });
}
