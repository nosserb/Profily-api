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
    // Extract CV text from JSON body
    const { cvText, fileName } = req.body || {};

    if (!cvText || typeof cvText !== 'string') {
      return res.status(400).json({ error: 'CV text is required' });
    }

    if (cvText.trim().length === 0) {
      return res.status(400).json({ error: 'CV text is empty' });
    }

    const pollinationsKey = process.env.POLLINATIONS_KEY;
    if (!pollinationsKey) {
      return res.status(500).json({ error: 'Pollinations API key not configured' });
    }

    const systemPrompt = `Tu es un expert en recrutement et en intelligence artificielle spécialisé dans l'analyse de CV.
Analyse le CV suivant et génère exactement 15 questions d'entretien personnalisées basées sur les compétences, l'expérience et les formations du candidat.
Les questions doivent être pertinentes, professionnelles et progressives en difficulté.
IMPORTANT: Retourne UNIQUEMENT un JSON valide sous cette forme EXACTE, sans aucun texte avant ou après:
{"questions": ["Question 1?", "Question 2?", "Question 3?", "Question 4?", "Question 5?", "Question 6?", "Question 7?", "Question 8?", "Question 9?", "Question 10?", "Question 11?", "Question 12?", "Question 13?", "Question 14?", "Question 15?"]}`;

    // Retry logic with multiple model fallbacks
    let response;
    let lastError;
    const maxRetries = 5;
    const baseDelay = 2000; // 2 seconds - increased for rate limiting
    const models = ['mistral', 'openai', 'deepseek', 'gemini']; // Fallback models
    let modelIndex = 0;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const currentModel = models[modelIndex % models.length];
      
      try {
        console.log(`Attempt ${attempt + 1}/${maxRetries} with model: ${currentModel}`);
        
        response = await fetch('https://gen.pollinations.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${pollinationsKey}`,
          },
          body: JSON.stringify({
            model: currentModel,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Analyse ce CV et génère les questions:\n\n${cvText}` },
            ],
            temperature: 0.7,
            max_tokens: 2000,
          }),
        });

        if (response.ok) {
          console.log(`Success with model ${currentModel}`);
          break; // Success, exit retry loop
        }

        const errText = await response.text();
        lastError = errText;
        console.error(`Model ${currentModel} failed with ${response.status}: ${errText.substring(0, 200)}`);

        // If 429 (too many requests) or 502 (bad gateway), retry with delay or switch model
        if (response.status === 429 || response.status === 502) {
          if (attempt < maxRetries - 1) {
            // Try different model on next attempt for 429/502
            modelIndex++;
            const delay = baseDelay * Math.pow(2, Math.floor(attempt / models.length)); // Exponential backoff per model cycle
            console.log(`Rate limited/Gateway error. Switching to ${models[modelIndex % models.length]} in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        } else if (response.status === 403) {
          // 403 might be auth issue, try different model
          if (attempt < maxRetries - 1) {
            modelIndex++;
            const delay = baseDelay * Math.pow(2, Math.floor(attempt / models.length));
            console.log(`Auth error. Switching to ${models[modelIndex % models.length]} in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }

        throw new Error(`Pollinations API returned ${response.status}: ${errText}`);
      } catch (error) {
        if (attempt === maxRetries - 1) {
          throw error;
        }
        lastError = error.message;
        modelIndex++;
        const delay = baseDelay * Math.pow(2, Math.floor(attempt / models.length));
        console.log(`Request error: ${error.message}. Trying ${models[modelIndex % models.length]} in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    if (!response || !response.ok) {
      throw new Error(`Pollinations API failed after ${maxRetries} attempts with all models: ${lastError}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    console.log('=== MISTRAL RESPONSE DEBUG ===');
    console.log('Full content length:', content.length);
    console.log('Full content:', content);
    console.log('=============================');

    // Extract JSON from response - be very aggressive about finding it
    let questions = [];
    
    // Try multiple extraction strategies
    const strategies = [
      // Strategy 1: Find JSON by looking for "questions" key
      () => {
        const match = content.match(/\{[^{}]*"questions"[^{}]*\[[^\]]*\][^{}]*\}/s);
        if (match) {
          console.log('Strategy 1: Found questions object');
          return JSON.parse(match[0]);
        }
        return null;
      },
      // Strategy 2: Find any complete JSON object
      () => {
        const firstBrace = content.indexOf('{');
        const lastBrace = content.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          console.log('Strategy 2: Extracting JSON by position');
          const jsonStr = content.substring(firstBrace, lastBrace + 1);
          return JSON.parse(jsonStr);
        }
        return null;
      },
      // Strategy 3: Find any JSON array directly
      () => {
        const match = content.match(/\[[^\[\]]*\]/);
        if (match) {
          console.log('Strategy 3: Found JSON array');
          const parsed = JSON.parse(match[0]);
          if (Array.isArray(parsed)) return { questions: parsed };
        }
        return null;
      }
    ];

    let parsed = null;
    for (let i = 0; i < strategies.length; i++) {
      try {
        parsed = strategies[i]();
        if (parsed) {
          console.log(`Parsing succeeded with strategy ${i + 1}`);
          break;
        }
      } catch (e) {
        console.error(`Strategy ${i + 1} failed:`, e.message);
      }
    }

    // Extract questions array from parsed object
    if (parsed) {
      if (Array.isArray(parsed)) {
        questions = parsed;
      } else if (parsed.questions && Array.isArray(parsed.questions)) {
        questions = parsed.questions;
      } else if (parsed.data && Array.isArray(parsed.data)) {
        questions = parsed.data;
      }
      console.log('Extracted questions count:', questions.length);
    }
    
    // If JSON parsing failed, try splitting by newlines
    if (!Array.isArray(questions) || questions.length === 0) {
      console.log('All JSON strategies failed, trying line-based extraction');
      const lines = content.split('\n');
      questions = lines
        .filter(line => {
          const trimmed = line.trim();
          return trimmed.length > 10 && !trimmed.startsWith('{') && !trimmed.startsWith('[') && !trimmed.includes(':');
        })
        .map(q => q.replace(/^\d+\.\s*/, '').trim())
        .slice(0, 15);
      console.log('Line-based extraction found:', questions.length, 'questions');
    }

    // Ensure we have valid questions in the correct format
    if (!Array.isArray(questions) || questions.length === 0) {
      console.log('WARNING: No questions extracted, using default questions');
      questions = generateDefaultQuestions();
    }

    // Clean up questions array - ensure all are strings
    questions = questions.filter(q => {
      if (typeof q === 'string') return q.trim().length > 3;
      if (q && typeof q === 'object') return (q.text || q.question || '').toString().length > 3;
      return false;
    }).slice(0, 15);

    console.log('Final questions count before normalization:', questions.length);

    // Normalize questions to the format: { text: "...", hint: "..." }
    const normalizedQuestions = questions.map((q, idx) => {
      let text = '';
      
      if (typeof q === 'string') {
        text = q.trim();
      } else if (q && typeof q === 'object') {
        text = (q.text || q.question || q.label || JSON.stringify(q)).toString().trim();
      }
      
      // Remove common numbering patterns
      text = text.replace(/^\d+[\.\)\:\-]\s*/, '');
      
      if (text.length === 0) {
        text = `Question ${idx + 1}`;
      }
      
      return { text, hint: '' };
    });

    console.log('Normalized questions:', normalizedQuestions.length, normalizedQuestions.slice(0, 2));

    return res.status(200).json({
      interviewId: `interview_${Date.now()}`,
      questions: normalizedQuestions,
      fileName: fileName || 'cv.txt',
    });
  } catch (error) {
    console.error('CV analysis error:', error);
    return res.status(500).json({ error: `CV analysis failed: ${error.message}` });
  }
}

function generateDefaultQuestions() {
  return [
    'Parlez-moi de votre expérience professionnelle la plus significative.',
    'Quels sont vos plus grands points forts?',
    'Comment gérez-vous les conflits en équipe?',
    'Décrivez un projet complexe que vous avez mené.',
    'Quelles sont vos compétences techniques clés?',
    'Comment vous maintenez à jour avec les nouvelles technologies?',
    'Parlez-moi d\'une situation où vous avez dû apprendre rapidement.',
    'Quel est votre style de leadership?',
    'Comment mesurez-vous votre succès?',
    'Où vous voyez-vous dans 5 ans?',
    'Décrivez un moment où vous avez surmonté un obstacle.',
    'Comment travaillez-vous sous pression?',
    'Quelle est votre approche pour résoudre les problèmes?',
    'Donnez un exemple de votre créativité.',
    'Pourquoi postulez-vous pour ce poste?',
  ];
}
