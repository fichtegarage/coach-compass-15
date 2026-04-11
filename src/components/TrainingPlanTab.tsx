import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Play } from "lucide-react";
import WorkoutModal from "@/components/WorkoutModal";
import SessionCoachView from "@/components/SessionCoachView";

const ASSESSMENT_EXERCISES = [
  { name: "Overhead Squat", cue: "Arme gestreckt, Füße hüftbreit", metric: "Tiefe, Kniestellung, Vorneigung" },
  { name: "Einbeiniger Stand", cue: "30 Sekunden je Seite", metric: "Sekunden, Ausgleichsbewegungen" },
  { name: "Schulter Innenrotation", cue: "Arm 90° gebeugt, Daumen nach unten", metric: "Grad Bewegungsumfang" },
  { name: "Schulter Außenrotation", cue: "Arm 90° gebeugt, Daumen nach oben", metric: "Grad Bewegungsumfang" },
  { name: "Hip Hinge", cue: "Stab an Wirbelsäule, Knie leicht gebeugt", metric: "Qualität der Beugung" },
  { name: "Push-up", cue: "Körper gerade, Ellbogen 45°", metric: "Anzahl saubere Wdh." },
  { name: "Rumpfstabilität Plank", cue: "Neutrale Wirbelsäule, Bauch angespannt", metric: "Sekunden" },
];

interface Props {
  clientId: string;
}

export default function TrainingPlanTab({ clientId }: Props) {
  const [plans, setPlans] = useState<any[]>([]);
  const [activePlan, setActivePlan] = useState<any>(null);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editWorkout, setEditWorkout] = useState<any>(null);
  const [sessionWorkout, setSessionWorkout] = useState<any>(null);
  const [assessmentCompletedAt, setAssessmentCompletedAt] = useState<string | null>(null);

  async function load() {
    const { data: clientData } = await supabase
      .from("clients")
      .select("assessment_completed_at")
      .eq("id", clientId)
      .maybeSingle();
    setAssessmentCompletedAt(clientData?.assessment_completed_at ?? null);

    const { data: planData } = await supabase
      .from("training_plans")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });

    setPlans(planData ?? []);
    const active = planData?.find((p) => p.is_active) ?? planData?.[0] ?? null;
    setActivePlan(active);

    if (active) {
      const { data: wData } = await supabase
        .from("workouts")
        .select("*")
        .eq("plan_id", active.id)
        .order("created_at", { ascending: true });
      setWorkouts(wData ?? []);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [clientId]);

  async function deletePlan(planId: string) {
    if (!confirm("Plan wirklich löschen?")) return;
    await supabase.from("training_plans").delete().eq("id", planId);
    load();
  }

  async function deleteWorkout(workoutId: string) {
    if (!confirm("Einheit wirklich löschen?")) return;
    await supabase.from("workouts").delete().eq("id", workoutId);
    load();
  }

  if (loading) return <div>Lädt...</div>;

  const assessmentWorkout = workouts.find((w) => w.is_assessment);
  const regularWorkouts = workouts.filter((w) => !w.is_assessment);
  const firstRegularWorkout = regularWorkouts[0] ?? null;
  const showTrainingBanner = !!assessmentCompletedAt && regularWorkouts.length > 0;

  return (
    <div className="space-y-6">

      {showTrainingBanner && (
        <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <div>
            <p className="font-semibold text-green-800">✅ Assessment abgeschlossen</p>
            <p className="text-sm text-green-600">Der reguläre Trainingsplan kann jetzt starten.</p>
          </div>
          <Button
            className="bg-green-600 hover:bg-green-700 text-white"
            onClick={() => setSessionWorkout(firstRegularWorkout)}
          >
            <Play className="w-4 h-4 mr-1" /> Training starten
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg">{activePlan?.name ?? "Kein aktiver Plan"}</h3>
          {activePlan && <p className="text-sm text-slate-500">{activePlan.description}</p>}
        </div>
        <Button size="sm" onClick={() => { setEditWorkout(null); setShowModal(true); }}>
          <Plus className="w-4 h-4 mr-1" /> Einheit
        </Button>
      </div>

      {!activePlan && (
        <p className="text-slate-400 text-sm">Noch kein Trainingsplan vorhanden.</p>
      )}

      {assessmentWorkout && (
        <Card className="border-amber-300 bg-amber-50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base text-amber-800">🧪 {assessmentWorkout.name}</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setSessionWorkout(assessmentWorkout)}>
                  <Play className="w-3 h-3 mr-1" /> Starten
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditWorkout(assessmentWorkout); setShowModal(true); }}>
                  <Pencil className="w-3 h-3" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => deleteWorkout(assessmentWorkout.id)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-amber-700 text-left">
                    <th className="pb-1 pr-2">Übung</th>
                    <th className="pb-1 pr-2">Coaching-Cue</th>
                    <th className="pb-1">Messgröße</th>
                  </tr>
                </thead>
                <tbody>
                  {ASSESSMENT_EXERCISES.map((ex) => (
                    <tr key={ex.name} className="border-t border-amber-100">
                      <td className="py-1 pr-2 font-medium">{ex.name}</td>
                      <td className="py-1 pr-2 text-slate-500">{ex.cue}</td>
                      <td className="py-1 text-amber-600">{ex.metric}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {regularWorkouts.length > 0 && (
        <div className="space-y-3">
          {regularWorkouts.map((w) => (
            <Card key={w.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{w.name}</CardTitle>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setSessionWorkout(w)}>
                      <Play className="w-3 h-3 mr-1" /> Starten
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setEditWorkout(w); setShowModal(true); }}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteWorkout(w.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {w.exercises?.length > 0 && (
                <CardContent>
                  <ul className="space-y-1">
                    {w.exercises.map((ex: any, i: number) => (
                      <li key={i} className="text-sm text-slate-600">
                        {ex.name} — {ex.sets}×{ex.reps} {ex.weight ? `@ ${ex.weight}` : ""}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {showModal && (
        <WorkoutModal
          clientId={clientId}
          planId={activePlan?.id}
          workout={editWorkout}
          onClose={() => { setShowModal(false); load(); }}
        />
      )}

      {sessionWorkout && (
        <SessionCoachView
          clientId={clientId}
          workoutId={sessionWorkout.id}
          isAssessment={sessionWorkout.is_assessment}
          onClose={() => { setSessionWorkout(null); load(); }}
        />
      )}
    </div>
  );
}
