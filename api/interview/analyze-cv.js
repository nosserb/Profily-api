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
IMPORTANT: Retourne UNIQUEMENT un JSON valide au format suivant, sans aucun texte avant ou après:
{
  "questions": [
    "Première question?",
    "Deuxième question?",
    ...
  ]
}`;

    // Retry logic for rate limiting
    let response;
    let lastError;
    const maxRetries = 3;
    const baseDelay = 1000; // 1 second

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
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Analyse ce CV et génère les questions:\n\n${cvText}` },
            ],
            temperature: 0.7,
          }),
        });

        if (response.ok) {
          break; // Success, exit retry loop
        }

        const errText = await response.text();
        lastError = errText;

        // If 429 (too many requests) or 502 (bad gateway), retry
        if (response.status === 429 || response.status === 502) {
          if (attempt < maxRetries - 1) {
            const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff
            console.log(`Rate limited (${response.status}). Retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries})`);
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
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`Request failed: ${error.message}. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    if (!response || !response.ok) {
      throw new Error(`Pollinations API failed after ${maxRetries} attempts: ${lastError}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    console.log('Mistral response content:', content.substring(0, 500));
    console.log('Content length:', content.length);

    // Extract JSON from response - handle various formats
    let questions = [];
    
    // Try to extract JSON object - look specifically for "questions" array
    let jsonMatch = content.match(/\{[\s\S]*"questions"[\s\S]*\}/);
    
    if (!jsonMatch) {
      // Try more flexible regex
      jsonMatch = content.match(/\{[\s\S]*\}/);
    }

    if (jsonMatch) {
      try {
        console.log('Found JSON match, attempting to parse...');
        const parsed = JSON.parse(jsonMatch[0]);
        console.log('Successfully parsed JSON:', Object.keys(parsed));
        
        // Handle different JSON structures
        if (Array.isArray(parsed)) {
          questions = parsed.map(q => typeof q === 'string' ? q : q.text || q.question || JSON.stringify(q));
        } else if (parsed.questions && Array.isArray(parsed.questions)) {
          questions = parsed.questions.map(q => typeof q === 'string' ? q : q.text || q.question || JSON.stringify(q));
        } else if (parsed.text) {
          questions = [parsed.text];
        }
        console.log('Extracted questions from JSON:', questions.length, questions.slice(0, 2));
      } catch (e) {
        console.error('JSON parse error:', e.message, 'JSON string:', jsonMatch[0].substring(0, 200));
        // Fallback: split by newlines
        questions = content.split('\n').filter(q => q.trim().length > 10 && !q.startsWith('{')).slice(0, 15);
      }
    } else {
      console.log('No JSON found in content, using fallback split by newlines');
      // Fallback: split by newlines or numbering
      questions = content
        .split('\n')
        .filter(q => q.trim().length > 10)
        .map(q => q.replace(/^\d+\.\s*/, '').trim())
        .slice(0, 15);
    }

    // Ensure we have valid questions in the correct format
    if (!Array.isArray(questions) || questions.length === 0) {
      console.log('WARNING: No questions extracted, using default questions. questions type:', typeof questions, 'length:', questions?.length);
      questions = generateDefaultQuestions();
    }

    // Normalize questions to the format: { text: "...", hint: "..." }
    const normalizedQuestions = questions.map(q => {
      if (typeof q === 'string') {
        return { text: q, hint: '' };
      }
      return {
        text: q.text || q.question || JSON.stringify(q),
        hint: q.hint || ''
      };
    });

    console.log('Extracted questions:', normalizedQuestions.length, normalizedQuestions.slice(0, 2));

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
