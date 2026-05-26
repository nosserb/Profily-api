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

  try {
    const { interviewId, answers } = req.body || {};

    return res.status(200).json({
      success: true,
      interviewId,
      score: 75,
      feedback: 'Bon entretien. À améliorer: communication et gestion du stress.',
      recommendations: [
        'Travailler sur la clarté du discours',
        'Pratiquer des questions comportementales',
        'Améliorer la gestion du temps',
      ],
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
