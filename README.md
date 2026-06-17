# Editeur Devis - L'Atelier du Bois

Logiciel de bureau Electron pour une entreprise de menuiserie.

Fonctions principales:

- gestion des clients
- creation de devis
- transformation devis vers bon de commande
- transformation devis/BC vers facture
- lignes de prestations menuiserie
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
