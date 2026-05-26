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
    // Parse FormData to extract CV file
    const cv = req.body?.cv || '';
    const cvText = typeof cv === 'string' ? cv : '';

    if (!cvText) {
      return res.status(400).json({ error: 'CV text is required' });
    }

    const pollinationsKey = process.env.POLLINATIONS_KEY;
    if (!pollinationsKey) {
      return res.status(500).json({ error: 'Pollinations API key not configured' });
    }

    const systemPrompt = `Tu es un expert en recrutement et en intelligence artificielle spécialisé dans l'analyse de CV.
Analyse le CV suivant et génère 15 questions d'entretien personnalisées basées sur les compétences, l'expérience et les formations du candidat.
Les questions doivent être pertinentes, professionnelles et progressives en difficulté.
Retourne un JSON structuré avec un tableau 'questions' contenant chaque question.`;

    const response = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${pollinationsKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Analyse ce CV et génère les questions:\n\n${cvText}` },
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      throw new Error(`Pollinations API returned ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    let questions = [];
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        questions = parsed.questions || [];
      } catch {
        questions = content.split('\n').filter(q => q.trim().length > 0).slice(0, 15);
      }
    } else {
      questions = content.split('\n').filter(q => q.trim().length > 0).slice(0, 15);
    }

    return res.status(200).json({
      interviewId: `interview_${Date.now()}`,
      questions: questions.length > 0 ? questions : generateDefaultQuestions(),
      fileName: 'cv.txt',
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
