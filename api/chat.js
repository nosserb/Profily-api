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

    // Call Pollinations API with retry logic
    let response;
    let lastError;
    const maxRetries = 3;
    const baseDelay = 1000;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        response = await fetch('https://gen.pollinations.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${pollinationsKey}`,
          },
          body: JSON.stringify({
            model: 'mistral',
            messages: messages,
            temperature: 0.7,
            max_tokens: 2000,
          }),
        });

        if (response.ok) {
          break;
        }

        const errText = await response.text();
        lastError = errText;

        // Retry on 429 (rate limit) or 502 (bad gateway)
        if (response.status === 429 || response.status === 502) {
          if (attempt < maxRetries - 1) {
            const delay = baseDelay * Math.pow(2, attempt);
            console.log(`Chat rate limited (${response.status}). Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }

        throw new Error(`Pollinations API returned ${response.status}`);
      } catch (error) {
        if (attempt === maxRetries - 1) {
          throw error;
        }
        lastError = error.message;
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`Chat request failed. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    if (!response || !response.ok) {
      return res.status(502).json({
        error: `Pollinations API error after ${maxRetries} attempts`,
        details: lastError,
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
