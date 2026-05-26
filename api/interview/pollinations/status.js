export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const pollinationsKey = process.env.POLLINATIONS_KEY;

  return res.status(200).json({
    status: pollinationsKey ? 'connected' : 'disconnected',
    provider: 'pollinations',
    message: pollinationsKey ? 'API connectée via serveur' : 'API non configurée',
  });
}
