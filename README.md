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

La version portable est generee dans `release/Devix-1.0.2-Portable.exe`.
En mode portable, les donnees sont stockees dans `Devix-data` a cote de l'executable, ce qui permet de copier l'outil sur une cle USB avec ses donnees.

Ne pas ouvrir `index.html` ou `dist/index.html` dans un navigateur. L'application doit etre lancee avec Electron.
