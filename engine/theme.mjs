/**
 * Theme layer.
 *
 * The AZ Contractor Pro marketing site (azcontractorprowebsite) already had a
 * real design system: surface/ink/brand/accent roles, a light and dark theme, a
 * space scale and a radius scale, and an explicit "flat and earthy: no
 * gradients" rule. Generated client sites did not use any of it — they got a
 * hand-rolled stylesheet with gradient heroes and hardcoded #111 text on
 * whatever accent the trade table happened to hold.
 *
 * This takes that token architecture and swaps in the trade's colour, so a
 * generated site inherits the structure and the accessibility work while still
 * looking like a roofer's site rather than ours.
 */

import { shade, onColor, contrast } from "./html.mjs";

/** Fonts actually used by the trade table, so we only request what we need. */
const FONT_WEIGHTS = {
  display: "wght@600;700;800",
  body: "wght@400;600"
};

export function fontHref(display, body) {
  const fams = [...new Set([display, body])]
    .map(f => `family=${f.replace(/ /g, "+")}:${f === display ? FONT_WEIGHTS.display : FONT_WEIGHTS.body}`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${fams}&display=swap`;
}

/**
 * Build the token set. Brand and accent come from the trade; everything
 * derived from them is computed, including which ink reads on top.
 *
 * Trade accents include a near-yellow (#FBBF24, electrical). White text on it
 * is 1.67:1, which fails WCAG badly — builder.html shipped that. onColor picks
 * the readable ink instead of assuming.
 */
/**
 * Nudge a colour until the best available ink on it reaches `min`.
 *
 * Some trade colours land just short: the concrete orange #EA580C tops out at
 * 4.48:1, which fails AA for the 16px bold button text sitting on it. Rather
 * than drop to a 3:1 "large text" excuse, shift the colour by the smallest
 * amount that clears the bar. Both directions are tried and the nearer one
 * wins, so the hue is preserved and the change is barely perceptible.
 */
function ensureContrast(hex, min = 4.5) {
  const best = c => Math.max(contrast(c, "#FFFFFF"), contrast(c, "#13242D"));
  if (best(hex) >= min) return hex;
  for (let step = 0.02; step <= 0.6; step += 0.02) {
    const darker = shade(hex, -step);
    if (best(darker) >= min) return darker;
    const lighter = shade(hex, step);
    if (best(lighter) >= min) return lighter;
  }
  return hex;
}

export function tokens(spec) {
  const brand = ensureContrast(spec.site.theme.primary);
  const accent = ensureContrast(spec.site.theme.accent);

  // On a dark surface a deep brand colour disappears. Lift it until it has
  // enough contrast against the dark ground to work as a link/heading colour.
  let darkBrand = brand;
  for (let i = 0; i < 9 && contrast(darkBrand, "#0F1D24") < 4.5; i++) {
    darkBrand = shade(darkBrand, 0.12);
  }
  let darkAccent = accent;
  for (let i = 0; i < 9 && contrast(darkAccent, "#0F1D24") < 4.5; i++) {
    darkAccent = shade(darkAccent, 0.1);
  }

  return {
    light: {
      surface: "#FFFFFF",
      surfaceRaised: "#F7F5F1",
      surfaceSunk: "#EFEBE4",
      ink: "#1A1A17",
      inkMuted: "#595349",
      brand,
      onBrand: onColor(brand),
      brandSoft: shade(brand, 0.92),
      accent,
      onAccent: onColor(accent),
      hairline: "#E0DBD1",
      borderStrong: "#A9A197",
      danger: "#A33C26",
      ok: "#2F6B34"
    },
    dark: {
      surface: "#121A1E",
      surfaceRaised: "#1B262B",
      surfaceSunk: "#0D1316",
      ink: "#EDE8DF",
      inkMuted: "#A8ADA6",
      brand: darkBrand,
      onBrand: onColor(darkBrand),
      brandSoft: shade(brand, -0.55),
      accent: darkAccent,
      onAccent: onColor(darkAccent),
      hairline: "#2A363B",
      borderStrong: "#5C6B71",
      danger: "#E8907A",
      ok: "#7FBF84"
    },
    // The night band is fixed across themes: it is a deliberate dark section
    // on a light page, so it must not invert when the theme does.
    night: {
      bg: "#13242D",
      raised: "#1A2E38",
      ink: "#EEE6D9",
      inkMuted: "#A7B4B7",
      hairline: "#2C434E"
    },
    fonts: { display: spec.site.theme.display, body: spec.site.theme.body },
    space: { 1: "4px", 2: "8px", 3: "12px", 4: "16px", 6: "24px", 8: "32px", 12: "48px", 16: "64px", 20: "80px" },
    radius: { sm: "4px", md: "8px", lg: "14px", pill: "999px" },
    max: "1120px"
  };
}

/** Emit the :root / dark-media CSS custom property blocks. */
export function cssVars(tk) {
  const vars = (o, map) => Object.entries(map).map(([k, v]) => `  --${k}:${o[v]};`).join("\n");
  const roles = {
    surface: "surface", "surface-raised": "surfaceRaised", "surface-sunk": "surfaceSunk",
    ink: "ink", "ink-muted": "inkMuted",
    brand: "brand", "on-brand": "onBrand", "brand-soft": "brandSoft",
    accent: "accent", "on-accent": "onAccent",
    hairline: "hairline", "border-strong": "borderStrong",
    danger: "danger", ok: "ok"
  };

  return `:root{
${vars(tk.light, roles)}

  --night:${tk.night.bg};
  --night-raised:${tk.night.raised};
  --on-night:${tk.night.ink};
  --on-night-muted:${tk.night.inkMuted};
  --night-hairline:${tk.night.hairline};

  --display:${tk.fonts.display},"Helvetica Neue",Arial,sans-serif;
  --body:${JSON.stringify(tk.fonts.body)},"Segoe UI",system-ui,sans-serif;

${Object.entries(tk.space).map(([k, v]) => `  --space-${k}:${v};`).join("\n")}
${Object.entries(tk.radius).map(([k, v]) => `  --radius-${k}:${v};`).join("\n")}
  --max:${tk.max};
  --focus:var(--brand);
}

@media (prefers-color-scheme:dark){
  :root{
${vars(tk.dark, roles)}
  }
}`;
}
