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
          { role: 'user', content: `Analyse ce CV et génère les questions:\n\n${cvText}` },
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Pollinations error:', {
        status: response.status,
        keyPrefix: pollinationsKey?.substring(0, 5),
        error: errText?.substring(0, 500),
      });
      throw new Error(`Pollinations API returned ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    console.log('Mistral response content:', content.substring(0, 500));

    // Extract JSON from response - handle various formats
    let questions = [];
    
    // Try to extract JSON object
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        // Handle different JSON structures
        if (Array.isArray(parsed)) {
          questions = parsed.map(q => typeof q === 'string' ? q : q.text || q.question || JSON.stringify(q));
        } else if (parsed.questions && Array.isArray(parsed.questions)) {
          questions = parsed.questions.map(q => typeof q === 'string' ? q : q.text || q.question || JSON.stringify(q));
        } else if (parsed.text) {
          questions = [parsed.text];
        }
      } catch (e) {
        console.error('JSON parse error:', e.message);
        // Fallback: split by newlines
        questions = content.split('\n').filter(q => q.trim().length > 10 && !q.startsWith('{')).slice(0, 15);
      }
    } else {
      // Fallback: split by newlines or numbering
      questions = content
        .split('\n')
        .filter(q => q.trim().length > 10)
        .map(q => q.replace(/^\d+\.\s*/, '').trim())
        .slice(0, 15);
    }

    // Ensure we have valid questions
    if (!Array.isArray(questions) || questions.length === 0) {
      questions = generateDefaultQuestions();
    }

    console.log('Extracted questions:', questions.length, questions.slice(0, 2));

    return res.status(200).json({
      interviewId: `interview_${Date.now()}`,
      questions: questions.length > 0 ? questions : generateDefaultQuestions(),
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
