<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/f1d51c77-2e6d-41a8-8ff2-dba734e6b581

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Optional: for local-only tavern/POI LLM testing, set `GEMINI_API_KEY` and `VITE_ENABLE_CLIENT_LLM=true` in `.env.local`
3. Run the app:
   `npm run dev`

For public/Vercel builds, leave `GEMINI_API_KEY` unset. The game runs with non-LLM tavern and POI fallbacks.
