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
    const { interviewId, questionIndex, answer } = req.body || {};

    if (!answer) {
      return res.status(400).json({ error: 'Answer is required' });
    }

    return res.status(200).json({
      success: true,
      message: 'Réponse enregistrée',
      questionIndex: questionIndex || 0,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
