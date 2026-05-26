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

    // Call Pollinations API with retry logic and model fallbacks
    let response;
    let lastError;
    const maxRetries = 5;
    const baseDelay = 2000;
    const models = ['mistral', 'openai', 'deepseek', 'gemini'];
    let modelIndex = 0;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const currentModel = models[modelIndex % models.length];
      
      try {
        console.log(`Chat attempt ${attempt + 1}/${maxRetries} with model: ${currentModel}`);
        
        response = await fetch('https://gen.pollinations.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${pollinationsKey}`,
          },
          body: JSON.stringify({
            model: currentModel,
            messages: messages,
            temperature: 0.7,
            max_tokens: 2000,
          }),
        });

        if (response.ok) {
          console.log(`Chat success with model ${currentModel}`);
          break;
        }

        const errText = await response.text();
        lastError = errText;
        console.error(`Chat model ${currentModel} failed with ${response.status}`);

        // Retry on 429 (rate limit) or 502 (bad gateway)
        if (response.status === 429 || response.status === 502 || response.status === 403) {
          if (attempt < maxRetries - 1) {
            modelIndex++;
            const delay = baseDelay * Math.pow(2, Math.floor(attempt / models.length));
            console.log(`Chat switching to ${models[modelIndex % models.length]} in ${delay}ms...`);
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
        modelIndex++;
        const delay = baseDelay * Math.pow(2, Math.floor(attempt / models.length));
        console.log(`Chat error. Trying ${models[modelIndex % models.length]} in ${delay}ms...`);
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
