# Devix - demarrage local

Ce projet est un vrai logiciel de bureau Electron.

Il ne faut pas ouvrir `index.html` ou `dist/index.html` dans le navigateur. Ces fichiers sont charges par Electron avec son moteur d'application, son stockage local et son API PDF.

## Tester sans installer

Double-cliquer:

```text
LANCER-DEVIX.bat
```

Le lanceur utilise d'abord la version portable si elle existe, sinon il demarre le mode developpement:

```text
release\Devix-1.0.2-Portable.exe
```

## Utiliser sur cle USB

Copier ces elements sur la cle:

```text
release\Devix-1.0.2-Portable.exe
LANCER-DEVIX.bat
```

Au premier lancement portable, Devix cree automatiquement ce dossier a cote de l'executable:

```text
Devix-data
```

Ce dossier contient les donnees locales, les pieces jointes et les sauvegardes locales. Pour deplacer Devix, copier l'executable portable et `Devix-data` ensemble.

## Lancer depuis le terminal

```bash
npm run dev
```

## Lancer le build local

```bash
npm run build
npm start
```

## Regenerer la version portable

```bash
npm run portable
```

## Generer installeur + portable

```bash
npm run dist
```

Les erreurs du type `CORS`, `origin null`, `file://` ou `Failed to load resource /src/main.tsx` apparaissent uniquement quand on ouvre le HTML directement dans un navigateur. Ce n'est pas le bon mode de lancement pour cette application.

## Liens email Supabase

Les confirmations de compte, invitations equipe et reinitialisations de mot de passe utilisent `VITE_AUTH_REDIRECT_URL`.

Pour une application installee, utiliser:

```text
VITE_AUTH_REDIRECT_URL=devix://app/index.html
```

Pour un usage multi-machines sans application installee, utiliser plutot une URL HTTPS stable, par exemple une petite page web de redirection:

```text
VITE_AUTH_REDIRECT_URL=https://votre-domaine.fr/auth/callback
```

Cette URL doit aussi etre ajoutee dans Supabase, dans Authentication > URL Configuration > Redirect URLs.

Le dossier `auth-callback/` contient une page statique prete a heberger. Elle recupere les parametres du lien Supabase puis ouvre Devix avec le protocole `devix://`.

Exemple avec Vercel ou Netlify:

```text
Publier le dossier: auth-callback
URL obtenue: https://devix-auth.vercel.app
VITE_AUTH_REDIRECT_URL=https://devix-auth.vercel.app
```

Ajouter ensuite cette meme URL dans Supabase:

```text
Authentication > URL Configuration > Redirect URLs
https://devix-auth.vercel.app
```

Si vous publiez la page dans un sous-dossier, utilisez l'URL complete, par exemple:

```text
https://votre-domaine.fr/auth/callback
```
