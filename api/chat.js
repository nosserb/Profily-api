export default async function handler(req, res) {
  // CORS headers for cross-origin requests
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
    const { message, conversationHistory } = req.body || {};

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required and must be a string' });
    }

    const pollinationsKey = process.env.POLLINATIONS_KEY;
    if (!pollinationsKey) {
      return res.status(500).json({ error: 'Pollinations API key not configured' });
    }

    // Build messages array from conversation history
    const messages = Array.isArray(conversationHistory) ? conversationHistory : [];
    messages.push({ role: 'user', content: message });

    // Call Pollinations API
    const response = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${pollinationsKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4-turbo',
        messages: messages,
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Pollinations API error:', response.status, errorText);
      return res.status(502).json({
        error: `Pollinations API error: ${response.status}`,
        details: errorText,
      });
    }

    const data = await response.json();
    const assistantMessage = data.choices?.[0]?.message?.content || '';

    if (!assistantMessage) {
      return res.status(502).json({ error: 'No response from Pollinations API' });
    }

    return res.status(200).json({
      success: true,
      message: assistantMessage,
      role: 'assistant',
    });
  } catch (error) {
    console.error('Chat error:', error);
    return res.status(500).json({
      error: `Chat failed: ${error.message}`,
    });
  }
}
