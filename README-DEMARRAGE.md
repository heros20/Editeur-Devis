# L'Atelier du Bois - demarrage local

Ce projet est un vrai logiciel de bureau Electron.

Il ne faut pas ouvrir `index.html` ou `dist/index.html` dans le navigateur. Ces fichiers sont charges par Electron avec son moteur d'application, son stockage local et son API PDF.

## Tester sans installer

Double-cliquer:

```text
LANCER-ATELIER-DU-BOIS.bat
```

Le lanceur utilise d'abord la version portable si elle existe, sinon il demarre le mode developpement:

```text
release\L'Atelier du Bois 1.0.1.exe
```

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
