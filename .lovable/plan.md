# Migrate Figma export to Lovable + connect existing Supabase

## What you'll get
1. Your Figma React export ported into this Lovable project (Vite + React + Tailwind + shadcn/ui), with sensible cleanup.
2. Your existing Supabase project (`qnnjtmhwcpsmpzlxdxex.supabase.co`) wired into the app via Lovable's native Supabase integration, ready to use auth and any tables you already have.

## Step 1 — Connect your existing Supabase (you do this once)

This is a manual click you need to make in the Lovable editor:

1. Top-right of the editor → **Supabase** → **Connect Supabase**.
2. Authorize Lovable, then pick the project at `qnnjtmhwcpsmpzlxdxex.supabase.co`.
3. Tell me when it's connected.

Once connected, Lovable auto-injects the Supabase URL + publishable anon key and generates `src/integrations/supabase/client.ts` plus typed table definitions from your live schema. I won't hardcode any keys.

## Step 2 — Unpack and inspect the Figma export

I'll extract `Figmaparallel-production.zip` into `/tmp` and inventory it:
- List all `.tsx`/`.jsx` screens, components, hooks, styles, and assets.
- Note framework signals (Next.js app router, plain React, Anima/Locofy patterns, CSS modules, Tailwind, styled-components, etc.).
- Identify routes/pages and shared layout pieces.

I'll report back what I find before doing big rewrites if anything unexpected shows up (e.g., it's actually Next.js with server components, or it depends on packages we'd rather not pull in).

## Step 3 — Port code into this project

Mapping the export to our stack:

- **Pages** → `src/pages/*.tsx`, registered as routes in `src/App.tsx` (above the catch-all `*`).
- **Components** → `src/components/*`. Reused primitives (buttons, inputs, dialogs, etc.) swapped to the existing `src/components/ui/*` shadcn versions where the API matches.
- **Assets** (images, svgs, fonts) → `src/assets/*`, imported as ES modules.
- **Global styles** → folded into `src/index.css` and the design tokens in `:root` / `.dark`. Hardcoded colors moved to HSL CSS variables; Tailwind classes kept where idiomatic.
- **Fonts** → loaded via `index.html` (Google Fonts) or `public/` if self-hosted.
- **Next.js-isms** (if present) → rewritten:
  - `next/link` → `react-router-dom` `Link`
  - `next/image` → plain `<img>` with imported asset
  - `next/navigation` hooks → `react-router-dom` equivalents
  - `app/` or `pages/` directories → flattened into `src/pages/`
- **Dead/unused exporter boilerplate** removed.

`src/pages/Index.tsx` (current placeholder) gets replaced with the export's home/landing screen.

## Step 4 — Wire Supabase

After Step 1 is done:

- Use the auto-generated `src/integrations/supabase/client.ts` (don't hand-roll a client, don't add env vars).
- Add a small `src/hooks/useAuth.ts` that subscribes to `onAuthStateChange` and exposes `{ session, user, loading }`. Set listener up before calling `getSession` (correct ordering).
- If the ported design has login/signup screens, hook them to `supabase.auth.signInWithPassword` / `signUp` / `signInWithOAuth({ provider: 'google' })` as applicable, plus `signOut`.
- For any data-driven UI in the export, map it to your existing tables via the generated typed client. I'll ask you which tables back which screens before writing queries — I won't guess your schema.

## Step 5 — QA

- Run typecheck/lint, fix issues.
- Walk through each ported route in the preview, check responsive behavior at common breakpoints, confirm assets load, confirm auth round-trips against your Supabase.

## Open questions I'll resolve as I go (or ask you)
- Which screen is the landing page / `/` route?
- Does the export include auth screens, or should I add minimal email + Google ones styled to match?
- Any existing tables I should bind specific screens to?

## What I need from you now
1. Click **Connect Supabase** in the editor and confirm here.
2. Approve this plan so I can switch out of plan mode and start unpacking + porting.
