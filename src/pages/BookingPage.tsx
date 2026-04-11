import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, MapPin, CheckCircle2 } from "lucide-react";

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("de-DE", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatTime(timeStr: string) {
  return timeStr?.slice(0, 5);
}

const EXERCISE_LABELS: Record<string, string> = {
  squat: "Kniebeuge",
  hinge: "Hip Hinge",
  pushup: "Push-up",
  row: "TRX / Inverted Row",
  plank: "Plank",
  shoulder_mobility: "Schultermobilität",
  single_leg: "Single-Leg Balance",
};

const EXERCISE_TYPES: Record<string, string> = {
  squat: "score",
  hinge: "score",
  pushup: "reps",
  row: "reps",
  plank: "seconds",
  shoulder_mobility: "score",
  single_leg: "seconds",
};

function classifyScore(value: string, type: string): "green" | "yellow" | "red" | null {
  const n = parseFloat(value);
  if (isNaN(n)) return null;
  if (type === "score") {
    if (n >= 4) return "green";
    if (n >= 3) return "yellow";
    return "red";
  }
  if (type === "reps") {
    if (n >= 10) return "green";
    if (n >= 5) return "yellow";
    return "red";
  }
  if (type === "seconds") {
    if (n >= 60) return "green";
    if (n >= 30) return "yellow";
    return "red";
  }
  return null;
}

function AssessmentSummaryCard({ log }: { log: any }) {
  const scores: Record<string, string> = log.assessment_scores ?? {};

  const strengths: string[] = [];
  const focusPoints: string[] = [];

  for (const [id, value] of Object.entries(scores)) {
    const type = EXERCISE_TYPES[id];
    if (!type) continue;
    const cls = classifyScore(String(value), type);
    const label = EXERCISE_LABELS[id] ?? id;
    if (cls === "green") strengths.push(label);
    if (cls === "red") focusPoints.push(label);
  }

  if (strengths.length === 0 && focusPoints.length === 0) return null;

  const dateLabel = log.completed_at
    ? new Date(log.completed_at).toLocaleDateString("de-DE", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
        Dein letztes Assessment
      </h2>
      {dateLabel && (
        <p className="text-xs text-slate-400">vom {dateLabel}</p>
      )}

      {strengths.length > 0 && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm text-green-700">💪 Deine Stärken</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <ul className="space-y-1">
              {strengths.map((s) => (
                <li key={s} className="flex items-center gap-2 text-sm text-green-800">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  {s}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {focusPoints.length > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm text-orange-700">🎯 Deine Fokuspunkte</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <ul className="space-y-1">
              {focusPoints.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-orange-800">
                  <span className="text-orange-400">→</span>
                  {f}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function BookingPage() {
  const { clientSlug } = useParams();
  const [client, setClient] = useState<any>(null);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [lastLog, setLastLog] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: clientData } = await supabase
        .from("clients")
        .select("id, name, coach_id")
        .eq("slug", clientSlug)
        .maybeSingle();

      if (!clientData) { setLoading(false); return; }
      setClient(clientData);

      const { data: appts } = await supabase
        .from("appointments")
        .select("*")
        .eq("client_id", clientData.id)
        .order("date", { ascending: true });

      setAppointments(appts ?? []);

      // Letzten Assessment-Log laden
      const { data: logData } = await supabase
        .from("workout_logs")
        .select("assessment_scores, completed_at, coach_notes")
        .eq("client_id", clientData.id)
        .not("assessment_scores", "is", null)
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      setLastLog(logData ?? null);
      setLoading(false);
    }
    load();
  }, [clientSlug]);

  if (loading) return <div className="p-8 text-center">Lädt...</div>;
  if (!client) return <div className="p-8 text-center">Seite nicht gefunden.</div>;

  const upcoming = appointments.filter(
    (a) => a.status !== "cancelled" && new Date(a.date) >= new Date(new Date().toDateString())
  );
  const past = appointments.filter(
    (a) => a.status !== "cancelled" && new Date(a.date) < new Date(new Date().toDateString())
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-slate-800">Hallo, {client.name}! 👋</h1>
          <p className="text-slate-500">Deine Coaching-Übersicht</p>
        </div>

        {/* Assessment-Zusammenfassung */}
        {lastLog && <AssessmentSummaryCard log={lastLog} />}

        {/* Upcoming */}
        {upcoming.length > 0 ? (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Nächste Termine</h2>
            {upcoming.map((appt) => (
              <Card key={appt.id}>
                <CardContent className="pt-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge variant={appt.status === "confirmed" ? "default" : "secondary"}>
                      {appt.status === "confirmed" ? "Bestätigt" : appt.status === "pending" ? "Ausstehend" : appt.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-700">
                    <Calendar className="h-4 w-4 text-slate-400" />
                    {formatDate(appt.date)}
                  </div>
                  {appt.time && (
                    <div className="flex items-center gap-2 text-sm text-slate-700">
                      <Clock className="h-4 w-4 text-slate-400" />
                      {formatTime(appt.time)} Uhr
                    </div>
                  )}
                  {appt.location && (
                    <div className="flex items-center gap-2 text-sm text-slate-700">
                      <MapPin className="h-4 w-4 text-slate-400" />
                      {appt.location}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="pt-4 text-center text-slate-500 text-sm">
              Keine bevorstehenden Termine.
            </CardContent>
          </Card>
        )}

        {/* Past */}
        {past.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Vergangene Termine</h2>
            {past.map((appt) => (
              <Card key={appt.id} className="opacity-60">
                <CardContent className="pt-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    {formatDate(appt.date)}
                    {appt.time && <span>· {formatTime(appt.time)} Uhr</span>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
