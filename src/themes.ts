export const themeIds = ["devix", "ocean", "emerald", "midnight", "burgundy", "lavender", "amber", "slate", "rose"] as const;

export type ThemeId = (typeof themeIds)[number];

export interface ThemeColors {
  primary: string;
  primaryDark: string;
  accent: string;
  sidebar: string;
  sidebarActive: string;
  sidebarText: string;
  background: string;
  surface: string;
  soft: string;
  text: string;
  muted: string;
  border: string;
}

export interface DevixTheme {
  id: ThemeId;
  name: string;
  description: string;
  colors: ThemeColors;
}

export const devixThemes: DevixTheme[] = [
  {
    id: "devix",
    name: "Devix",
    description: "Sauge, argile et tons naturels",
    colors: {
      primary: "#466b5f",
      primaryDark: "#304c43",
      accent: "#826b58",
      sidebar: "#1c2c27",
      sidebarActive: "#30483f",
      sidebarText: "#f6fbf7",
      background: "#f4f5f1",
      surface: "#ffffff",
      soft: "#eeeae3",
      text: "#2d302c",
      muted: "#69736e",
      border: "#d9d8d0",
    },
  },
  {
    id: "ocean",
    name: "Océan",
    description: "Bleu marin et azur équilibré",
    colors: {
      primary: "#287892",
      primaryDark: "#1d576c",
      accent: "#438da4",
      sidebar: "#142d38",
      sidebarActive: "#234a5a",
      sidebarText: "#effaff",
      background: "#f1f7f9",
      surface: "#ffffff",
      soft: "#e5f0f4",
      text: "#20343d",
      muted: "#657b85",
      border: "#ccdde3",
    },
  },
  {
    id: "emerald",
    name: "Émeraude",
    description: "Vert forêt et menthe douce",
    colors: {
      primary: "#347b62",
      primaryDark: "#265a49",
      accent: "#55947d",
      sidebar: "#193229",
      sidebarActive: "#2a4d41",
      sidebarText: "#effcf6",
      background: "#f2f7f4",
      surface: "#ffffff",
      soft: "#e6f0eb",
      text: "#263831",
      muted: "#687b73",
      border: "#cfddd7",
    },
  },
  {
    id: "midnight",
    name: "Minuit",
    description: "Indigo profond et bleu brume",
    colors: {
      primary: "#536d9b",
      primaryDark: "#3d5074",
      accent: "#7087af",
      sidebar: "#1c2435",
      sidebarActive: "#303d58",
      sidebarText: "#f5f7fb",
      background: "#f1f3f7",
      surface: "#ffffff",
      soft: "#e8ecf3",
      text: "#293244",
      muted: "#6b7488",
      border: "#d3d9e4",
    },
  },
  {
    id: "burgundy",
    name: "Bordeaux",
    description: "Bordeaux et vieux rose feutré",
    colors: {
      primary: "#91475a",
      primaryDark: "#693442",
      accent: "#ae6878",
      sidebar: "#352129",
      sidebarActive: "#553440",
      sidebarText: "#fff7f8",
      background: "#f9f3f5",
      surface: "#ffffff",
      soft: "#f2e5e9",
      text: "#3b2b31",
      muted: "#806a71",
      border: "#e3d1d6",
    },
  },
  {
    id: "lavender",
    name: "Lavande",
    description: "Violet minéral et lilas doux",
    colors: {
      primary: "#7660a3",
      primaryDark: "#574879",
      accent: "#9581b8",
      sidebar: "#2c2738",
      sidebarActive: "#453b59",
      sidebarText: "#fbf8ff",
      background: "#f6f4f9",
      surface: "#ffffff",
      soft: "#ede9f3",
      text: "#342f3e",
      muted: "#756e80",
      border: "#ddd6e5",
    },
  },
  {
    id: "amber",
    name: "Ambre",
    description: "Ocre, miel et brun chaleureux",
    colors: {
      primary: "#a5682e",
      primaryDark: "#794c23",
      accent: "#bf854d",
      sidebar: "#33281f",
      sidebarActive: "#51402f",
      sidebarText: "#fffaf2",
      background: "#faf7f1",
      surface: "#ffffff",
      soft: "#f3eadc",
      text: "#3b3128",
      muted: "#7b7065",
      border: "#e2d6c7",
    },
  },
  {
    id: "slate",
    name: "Ardoise",
    description: "Gris bleuté et acier sobre",
    colors: {
      primary: "#5b7180",
      primaryDark: "#435560",
      accent: "#7d909b",
      sidebar: "#252e34",
      sidebarActive: "#3b4a53",
      sidebarText: "#f5f8fa",
      background: "#f3f5f6",
      surface: "#ffffff",
      soft: "#e9edef",
      text: "#303b42",
      muted: "#6c7880",
      border: "#d4dcdf",
    },
  },
  {
    id: "rose",
    name: "Rose poudré",
    description: "Rose poudré et framboise douce",
    colors: {
      primary: "#a25b75",
      primaryDark: "#794457",
      accent: "#bc7b92",
      sidebar: "#382730",
      sidebarActive: "#563b47",
      sidebarText: "#fff7fa",
      background: "#faf4f6",
      surface: "#ffffff",
      soft: "#f3e6eb",
      text: "#3d2e34",
      muted: "#806d74",
      border: "#e5d3da",
    },
  },
];

export const defaultThemeId: ThemeId = "devix";

export function isThemeId(value: unknown): value is ThemeId {
  return themeIds.includes(value as ThemeId);
}

export function getTheme(value: unknown): DevixTheme {
  return devixThemes.find((theme) => theme.id === value) ?? devixThemes[0];
}

export function themeCssVariables(theme: DevixTheme) {
  return {
    "--theme-primary": theme.colors.primary,
    "--theme-primary-dark": theme.colors.primaryDark,
    "--theme-accent": theme.colors.accent,
    "--theme-sidebar": theme.colors.sidebar,
    "--theme-sidebar-active": theme.colors.sidebarActive,
    "--theme-sidebar-text": theme.colors.sidebarText,
    "--theme-background": theme.colors.background,
    "--theme-surface": theme.colors.surface,
    "--theme-soft": theme.colors.soft,
    "--theme-text": theme.colors.text,
    "--theme-muted": theme.colors.muted,
    "--theme-border": theme.colors.border,
  };
}
