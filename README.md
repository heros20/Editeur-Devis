# Devix

Logiciel de bureau Electron pour gerer les devis, bons de commande et factures.

Fonctions principales:

- gestion des clients
- creation de devis
- transformation devis vers bon de commande
- transformation devis/BC vers facture
- lignes d'articles et prestations
- calcul HT, TVA, TTC et acompte
- export PDF
- sauvegarde locale
- version portable et installeur Windows

## Lancer en local

```bash
npm install
npm start
```

## Mode developpement

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Generer l'application Windows

Portable + installeur:

```bash
npm run dist
```

Portable seulement:

```bash
npm run portable
```

Ne pas ouvrir `index.html` ou `dist/index.html` dans un navigateur. L'application doit etre lancee avec Electron.
