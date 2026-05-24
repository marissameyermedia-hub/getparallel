# PARA//EL. Content Planner

Supabase-native dashboard for scheduling Instagram carousel posts.

## What this is
- Single-page HTML app, reads/writes directly to Supabase `scheduled_posts` table
- No build step — drop into any static host
- Updates live: refresh the page to see new posts added via the Canva → Supabase pipeline

## Setup
- Supabase project: `qnnjtmhwcpsmpzlxdxex`
- Anon key embedded in HTML (publishable, safe to expose with RLS policies)
- Storage bucket for slide PNGs: `social-media` (public)

## How Claude pushes content here
1. Edit text in Canva template (design `DAHKmK0J6Ls`)
2. Export pages as PNG via Canva API
3. Call `canva-to-planner` edge function → uploads PNGs + saves to `scheduled_posts`
4. Refresh this dashboard → post appears at the correct planner slot
