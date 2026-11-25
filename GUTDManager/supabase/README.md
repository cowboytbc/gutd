# Supabase setup

1. Open the Supabase project dashboard and go to **SQL Editor**.
2. Run [`schema.sql`](./schema.sql) once to create the band tables, row-level security rules, invite flow, private file bucket, and chat realtime publication.
3. Ensure **Email** is enabled under **Authentication → Providers**. If email confirmation is on, members must confirm before signing in.
4. Build and open GUTD Manager, choose **Chat**, create an account, then create the GUTD workspace. Use **Invite** to share a join code with band members.
5. Add the Gemini API key as `GEMINI_API_KEY` in the Supabase project's **Edge Function Secrets**. Do not put that key in the app or GitHub.
6. To deploy through GitHub Actions, add a `SUPABASE_ACCESS_TOKEN` secret to the repository under **Settings → Secrets and variables → Actions**. The workflow at [`../../.github/workflows/deploy-band-manager.yml`](../../.github/workflows/deploy-band-manager.yml) deploys `band-manager` on changes to `main`, or can be started manually from **Actions**. The project reference is configured in the workflow.
7. Alternatively, install the Supabase CLI, then from this project directory run `supabase login` and `supabase functions deploy band-manager --project-ref pibgazoibrdhwnotdazd`.
8. Open **AI Manager** in the app. Live web research is off by default and asks for confirmation each time because Google Search grounding may incur charges.

The app uses the project's publishable key in `SupabaseSettings.cs`. Publishable keys are intended for client apps; row-level security is enabled by the schema. Never put a `service_role` or other secret key in the app.

The Gemini function uses the signed-in member's JWT and RLS-scoped reads. It sends only the band name, upcoming event titles/dates, and open task titles/statuses. It does not send contact details or document contents, does not store Gemini interactions, and cannot write to the workspace or perform external actions. Google's free Gemini tier may use submitted content to improve its products; see [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing).
