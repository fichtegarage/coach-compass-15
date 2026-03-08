import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function formatICalDate(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

const sessionTypeLabels: Record<string, string> = {
  "In-Person Training": "Präsenz-Training",
  "Online Training": "Online-Training",
  "Phone Call": "Telefonat",
  "Check-In Call": "Check-In Call",
  "Free Intro": "Kostenloses Erstgespräch",
};

const statusLabels: Record<string, string> = {
  Completed: "Abgeschlossen",
  "No-Show": "Nicht erschienen",
  "Cancelled by Client": "Vom Kunden abgesagt",
  "Cancelled by Trainer": "Vom Trainer abgesagt",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const userId = url.searchParams.get("user_id");

  if (!userId) {
    return new Response("Missing user_id", { status: 400, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Fetch all sessions for this user with client names
  const { data: sessions, error } = await supabase
    .from("sessions")
    .select("*, clients(full_name)")
    .eq("user_id", userId)
    .order("session_date", { ascending: true });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Fetch packages for session counts
  const { data: packages } = await supabase
    .from("packages")
    .select("id, sessions_included")
    .eq("user_id", userId);

  const pkgMap = new Map((packages || []).map((p: any) => [p.id, p.sessions_included]));

  // Count sessions per package
  const pkgSessionCount = new Map<string, number>();
  for (const s of sessions || []) {
    if (s.package_id && ["Completed", "No-Show"].includes(s.status)) {
      pkgSessionCount.set(s.package_id, (pkgSessionCount.get(s.package_id) || 0) + 1);
    }
  }

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CoachHub//Training Sessions//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:CoachHub Trainings",
    `X-WR-TIMEZONE:Europe/Berlin`,
  ];

  for (const s of sessions || []) {
    const start = new Date(s.session_date);
    const end = new Date(start.getTime() + (s.duration_minutes || 60) * 60000);
    const clientName = (s.clients as any)?.full_name || "Unbekannt";
    const loc = s.location || "Gym";

    let countStr = "";
    if (s.package_id && pkgMap.has(s.package_id)) {
      const used = pkgSessionCount.get(s.package_id) || 0;
      const total = pkgMap.get(s.package_id);
      countStr = ` (${used}/${total})`;
    }

    const summary = `${clientName} – ${sessionTypeLabels[s.session_type] || s.session_type}${countStr}`;
    const description = `${statusLabels[s.status] || s.status}${s.notes ? "\\n" + s.notes : ""}`;

    lines.push("BEGIN:VEVENT");
    lines.push(`DTSTART:${formatICalDate(start)}`);
    lines.push(`DTEND:${formatICalDate(end)}`);
    lines.push(`SUMMARY:${summary}`);
    lines.push(`LOCATION:${loc}`);
    lines.push(`DESCRIPTION:${description}`);
    lines.push(`UID:${s.id}@coachhub`);
    lines.push(`DTSTAMP:${formatICalDate(new Date())}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  return new Response(lines.join("\r\n"), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="coachhub.ics"',
    },
  });
});
