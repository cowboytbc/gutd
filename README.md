# GUTD Manager

A .NET MAUI app for managing GUTD's band workspace. Supabase provides the backend, including the AI Manager Edge Function.

## Deploying the AI Manager

The GitHub Actions workflow deploys `band-manager` to Supabase when its function files change on `main`. It can also be started manually from the repository's **Actions** tab.

Before deploying, add a `SUPABASE_ACCESS_TOKEN` Actions secret in the repository's **Settings → Secrets and variables → Actions**. Create the token in your Supabase account and enter it directly in GitHub; do not commit or share it.

The Gemini API key belongs in Supabase Edge Function Secrets as `GEMINI_API_KEY`. It is not needed in GitHub. See [Supabase setup](GUTDManager/supabase/README.md) for backend setup details.
