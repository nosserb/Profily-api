# Configuration Vercel - URGENT

## Clé API Pollinations manquante sur Vercel

**Problème**: L'API retourne 403 Forbidden car la variable d'environnement `POLLINATIONS_KEY` n'est pas configurée sur Vercel.

## Solution: Ajouter la clé à Vercel

1. Va sur https://vercel.com/dashboard
2. Sélectionne le projet **profily-api**
3. Clique sur **Settings** → **Environment Variables**
4. Ajoute une nouvelle variable:
   - **Name**: `POLLINATIONS_KEY`
   - **Value**: `sk_rnvhLcrDhdYW00l61QrHxLtfoB3o80iL`
   - **Environments**: Sélectionne **Production**, **Preview**, **Development**
5. Clique **Save**
6. Le deployment redémarrera automatiquement

## Vérification locale

Pour tester localement, la variable est déjà dans `.env.local` (fichier exclu de git pour sécurité).

## Commits protégés

- `.env.local` et `.env*` sont ajoutés à `.gitignore`
- Ne JAMAIS commiter les clés API
