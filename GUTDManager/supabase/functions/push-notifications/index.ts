import { createClient } from "npm:@supabase/supabase-js@2";
import { importPKCS8, SignJWT } from "npm:jose";

type WebhookPayload = {
  type?: unknown;
  table?: unknown;
  record?: Record<string, unknown> | null;
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

async function getFirebaseAccessToken(credentials: {
  client_email: string;
  private_key: string;
}): Promise<string> {
  const key = await importPKCS8(credentials.private_key, "RS256");
  const assertion = await new SignJWT({
    scope: "https://www.googleapis.com/auth/firebase.messaging",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(credentials.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) {
    console.error("Firebase OAuth token request failed:", response.status, await response.text());
    throw new Error("Could not authenticate with Firebase.");
  }

  const result = await response.json() as { access_token?: string };
  if (!result.access_token) {
    throw new Error("Firebase did not return an access token.");
  }
  return result.access_token;
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Use POST for push dispatch." }, 405);
  }

  const dispatchSecret = Deno.env.get("PUSH_DISPATCH_SECRET");
  if (!dispatchSecret) {
    console.error("Push dispatch is missing PUSH_DISPATCH_SECRET.");
    return jsonResponse({ error: "Push dispatch is not configured." }, 503);
  }
  if (request.headers.get("x-push-dispatch-secret") !== dispatchSecret) {
    return jsonResponse({ error: "Unauthorized push dispatch." }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const firebaseAccountValue = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
  if (!supabaseUrl || !serviceRoleKey || !firebaseAccountValue) {
    console.error("Push dispatch is missing Supabase or Firebase configuration.");
    return jsonResponse({ error: "Push dispatch is not configured." }, 503);
  }

  let payload: WebhookPayload;
  try {
    payload = await request.json() as WebhookPayload;
  } catch {
    return jsonResponse({ error: "Request body must be valid JSON." }, 400);
  }

  const record = payload.record;
  const table = asString(payload.table);
  const operation = asString(payload.type).toUpperCase();
  const isMessage = table === "band_messages" && operation === "INSERT";
  const isTask = table === "band_tasks" && (operation === "INSERT" || operation === "UPDATE");
  if (!record || (!isMessage && !isTask)) {
    return jsonResponse({ error: "Unsupported database notification event." }, 400);
  }

  const bandId = asString(record.band_id);
  if (!bandId) {
    return jsonResponse({ error: "The notification event has no band." }, 400);
  }

  let firebaseAccount: { client_email: string; private_key: string; project_id: string };
  try {
    firebaseAccount = JSON.parse(firebaseAccountValue);
  } catch {
    console.error("FIREBASE_SERVICE_ACCOUNT is not valid JSON.");
    return jsonResponse({ error: "Firebase credentials are invalid." }, 503);
  }
  if (!firebaseAccount.client_email || !firebaseAccount.private_key || !firebaseAccount.project_id) {
    console.error("FIREBASE_SERVICE_ACCOUNT is missing required fields.");
    return jsonResponse({ error: "Firebase credentials are invalid." }, 503);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const [membersResult, bandResult] = await Promise.all([
    admin.from("band_members").select("user_id").eq("band_id", bandId),
    admin.from("band_spaces").select("name").eq("id", bandId).maybeSingle(),
  ]);
  if (membersResult.error || bandResult.error) {
    console.error("Could not load push recipients:", membersResult.error?.message ?? bandResult.error?.message);
    return jsonResponse({ error: "Could not load push recipients." }, 500);
  }

  const senderId = isMessage ? asString(record.sender_id) : "";
  const memberIds = (membersResult.data ?? [])
    .map((member) => asString(member.user_id))
    .filter((userId) => userId && userId !== senderId);
  if (memberIds.length === 0) {
    return jsonResponse({ sent: 0 });
  }

  const isManagerReminder = isMessage && !senderId;
  const preferenceColumn = isTask
    ? "notify_task_updates"
    : isManagerReminder
    ? "notify_event_reminders"
    : "notify_chat_messages";
  const profilesResult = await admin
    .from("band_profiles")
    .select(`user_id, notifications_enabled, ${preferenceColumn}`)
    .in("user_id", memberIds);
  if (profilesResult.error) {
    console.error("Could not load push preferences:", profilesResult.error.message);
    return jsonResponse({ error: "Could not load push preferences." }, 500);
  }

  const recipientIds = (profilesResult.data ?? [])
    .filter((profile) => profile.notifications_enabled && profile[preferenceColumn])
    .map((profile) => asString(profile.user_id));
  if (recipientIds.length === 0) {
    return jsonResponse({ sent: 0 });
  }

  const tokensResult = await admin
    .from("band_push_tokens")
    .select("token")
    .in("user_id", recipientIds);
  if (tokensResult.error) {
    console.error("Could not load device tokens:", tokensResult.error.message);
    return jsonResponse({ error: "Could not load device tokens." }, 500);
  }
  const tokens = [...new Set((tokensResult.data ?? []).map((item) => asString(item.token)).filter(Boolean))];
  if (tokens.length === 0) {
    return jsonResponse({ sent: 0 });
  }

  const bandName = asString(bandResult.data?.name) || "Your band";
  const title = isTask
    ? `${bandName} task update`
    : isManagerReminder
    ? `${bandName} | MANAGER`
    : `${bandName} | New message`;
  const text = isTask
    ? `${asString(record.title) || "A task"} - ${asString(record.status) || "updated"}`
    : asString(record.body);
  const body = text.slice(0, 240) || "There is a new band update.";
  const accessToken = await getFirebaseAccessToken(firebaseAccount);
  const results = await Promise.all(tokens.map(async (token) => {
    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(firebaseAccount.project_id)}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: title.slice(0, 100), body },
            data: {
              kind: preferenceColumn,
              band_id: bandId,
            },
          },
        }),
      },
    );
    return { token, ok: response.ok, status: response.status, details: await response.text() };
  }));

  const staleTokens = results
    .filter((result) => !result.ok && (result.details.includes("UNREGISTERED") || result.details.includes("NOT_FOUND")))
    .map((result) => result.token);
  if (staleTokens.length > 0) {
    const { error } = await admin.from("band_push_tokens").delete().in("token", staleTokens);
    if (error) {
      console.error("Could not remove expired push tokens:", error.message);
    }
  }

  const failures = results.filter((result) => !result.ok && !staleTokens.includes(result.token));
  if (failures.length > 0) {
    console.error("Some Firebase push deliveries failed:", failures.map(({ status, details }) => ({ status, details })));
    return jsonResponse({ sent: results.length - failures.length, failed: failures.length }, 502);
  }

  return jsonResponse({ sent: results.length - staleTokens.length });
});
