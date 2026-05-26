export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const pollinationsKey = process.env.POLLINATIONS_KEY;
    
    const status = {
      env_set: !!pollinationsKey,
      key_length: pollinationsKey ? pollinationsKey.length : 0,
      key_preview: pollinationsKey ? pollinationsKey.substring(0, 10) + '...' : 'NOT SET',
      timestamp: new Date().toISOString(),
      runtime: process.env.NODE_ENV || 'unknown'
    };

    // Test API if key exists
    if (pollinationsKey) {
      const response = await fetch('https://gen.pollinations.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${pollinationsKey}`,
        },
        body: JSON.stringify({
          model: 'mistral',
          messages: [
            { role: 'system', content: 'You are a test.' },
            { role: 'user', content: 'Say OK' },
          ],
          temperature: 0.5,
        }),
      });

      status.api_status = response.status;
      status.api_ok = response.ok;

      if (!response.ok) {
        const errorText = await response.text();
        status.api_error = errorText.substring(0, 200);
      } else {
        const data = await response.json();
        status.api_message = data.choices?.[0]?.message?.content?.substring(0, 50);
      }
    }

    return res.status(200).json(status);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
