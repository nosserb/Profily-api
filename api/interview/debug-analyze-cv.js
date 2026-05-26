export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { cvText } = req.body || {};

    if (!cvText) {
      return res.status(400).json({ error: 'CV text required' });
    }

    const pollinationsKey = process.env.POLLINATIONS_KEY;
    if (!pollinationsKey) {
      return res.status(500).json({ error: 'API key not configured' });
    }

    const systemPrompt = `Tu es un expert en recrutement.
Analyse le CV et génère EXACTEMENT 15 questions d'entretien.
RETOURNE UNIQUEMENT CE JSON, RIEN D'AUTRE:
{"questions": ["Q1?", "Q2?", "Q3?", "Q4?", "Q5?", "Q6?", "Q7?", "Q8?", "Q9?", "Q10?", "Q11?", "Q12?", "Q13?", "Q14?", "Q15?"]}`;

    console.log('=== DEBUG CV ANALYSIS ===');
    console.log('CV Text length:', cvText.length);

    const response = await fetch('https://gen.pollinations.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${pollinationsKey}`,
      },
      body: JSON.stringify({
        model: 'mistral',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `CV: ${cvText}` },
        ],
        temperature: 0.3,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('API Error:', response.status, errText.substring(0, 500));
      return res.status(response.status).json({
        error: 'Mistral API error',
        status: response.status,
        details: errText.substring(0, 300),
      });
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content || '';

    console.log('=== RAW MISTRAL RESPONSE ===');
    console.log('Content:', rawContent);
    console.log('Length:', rawContent.length);

    // Try to parse JSON
    let parsed = null;
    const jsonStart = rawContent.indexOf('{');
    const jsonEnd = rawContent.lastIndexOf('}');

    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      const jsonStr = rawContent.substring(jsonStart, jsonEnd + 1);
      try {
        parsed = JSON.parse(jsonStr);
        console.log('✓ JSON Parsed successfully');
        console.log('Questions count:', parsed.questions?.length);
      } catch (e) {
        console.error('✗ JSON Parse failed:', e.message);
        console.error('JSON string:', jsonStr.substring(0, 200));
      }
    }

    return res.status(200).json({
      success: true,
      rawContent,
      parsed,
      debug: {
        content_length: rawContent.length,
        has_json: jsonStart !== -1,
        parsed_successfully: parsed !== null,
        questions_count: parsed?.questions?.length || 0,
      },
    });
  } catch (error) {
    console.error('Debug error:', error);
    return res.status(500).json({ error: error.message });
  }
}
