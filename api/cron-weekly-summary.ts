import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: Request) {
  // Cron-Job-Authentifizierung — Secret bleibt hier, kommt aber nie in Mails
  const secret = req.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://buchung.jakob-neumann.net";

  // Clients laden — jetzt MIT unsubscribe_token
  const { data: clients, error } = await supabase
    .from("clients")
    .select("id, name, email, trainer_id, unsubscribe_token")
    .eq("email_weekly_summary", true);

  if (error) {
    console.error("Error loading clients:", error);
    return new Response("Error loading clients", { status: 500 });
  }

  if (!clients || clients.length === 0) {
    return new Response("No clients to notify", { status: 200 });
  }

  // Aktuelle Kalenderwoche (Montag–Sonntag)
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay() + 1);
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);

  const results = [];

  for (const client of clients) {
    // Termine der Woche laden
    const { data: bookings } = await supabase
      .from("bookings")
      .select("date, time, type, status")
      .eq("client_id", client.id)
      .gte("date", startOfWeek.toISOString().split("T")[0])
      .lte("date", endOfWeek.toISOString().split("T")[0]);

    const bookingList =
      bookings && bookings.length > 0
        ? bookings
            .map(
              (b) =>
                `• ${b.date} um ${b.time} Uhr — ${b.type} (${b.status})`
            )
            .join("\n")
        : "Keine Termine diese Woche.";

    // Unsubscribe-Link mit persönlichem Token — kein CRON_SECRET mehr
    const unsubscribeUrl = `${baseUrl}/api/unsubscribe?client_id=${client.id}&token=${client.unsubscribe_token}`;

    const emailBody = `Hallo ${client.name},\n\nhier ist deine Wochenzusammenfassung:\n\n${bookingList}\n\nBis bald,\nJakob\n\n---\nUm dich abzumelden: ${unsubscribeUrl}`;

    const res = await fetch(`${baseUrl}/api/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cron-secret": process.env.CRON_SECRET!,
      },
      body: JSON.stringify({
        to: client.email,
        subject: "Deine Wochenzusammenfassung 💪",
        body: emailBody,
      }),
    });

    results.push({ client: client.email, status: res.status });
  }

  return new Response(JSON.stringify({ sent: results }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
