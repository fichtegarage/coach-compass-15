import { getLatestConversation, getHealthRecord } from '@/lib/onboarding-api';
import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  createConversation,
  createHealthRecord,
  getClient
} from '@/lib/onboarding-api';
import type { ConversationForm, HealthRecordForm } from '@/types/onboarding';
import { Users, UserPlus, ArrowLeft, ChevronDown, ChevronUp, Lightbulb } from 'lucide-react';

// ============================================
// CONFIGURATION
// ============================================

interface FieldConfig {
  id: string;
  label: string;
  placeholder: string;
  multiline?: boolean;
  isClientField?: boolean;
  deepQuestions?: {
    title: string;
    questions: string[];
  };
}

interface PhaseConfig {
  id: string;
  title: string;
  duration: string;
  icon: string;
  description: string;
  prompts: string[];
  fields: FieldConfig[];
  isHealthSection?: boolean;
}

const PHASES: PhaseConfig[] = [
  {
    id: 'ankommen',
    title: 'Ankommen',
    duration: '5 Min',
    icon: '👋',
    description: 'Beziehung aufbauen, keine Formulare',
    prompts: [
      'Begrüßung, Getränk anbieten',
      'Kurz deine Arbeitsweise erklären',
      'Entspannte Atmosphäre schaffen',
    ],
    fields: [],
  },
  {
    id: 'kennenlernen',
    title: 'Kennenlernen',
    duration: '15 Min',
    icon: '💬',
    description: 'Motivation und Geschichte verstehen',
    prompts: [
      'Wie bist du auf mich gekommen?',
      'Was hat dich motiviert, jetzt etwas zu ändern?',
      'Was hast du bisher versucht?',
      'Was hat funktioniert / was nicht?',
    ],
    fields: [
      {
        id: 'contact_source',
        label: 'Kontakt über',
        placeholder: 'Empfehlung, Instagram, Studio...',
      },
      {
        id: 'motivation',
        label: 'Motivation',
        placeholder: 'Was treibt ihn/sie an?',
        multiline: true,
        deepQuestions: {
          title: 'Tiefenfragen bei unklarer/oberflächlicher Motivation',
          questions: [
            'Stell dir vor, du hast dein Ziel erreicht. Du wachst morgens auf – was ist der erste Unterschied, den du bemerkst?',
            'Wer in deinem Leben würde die Veränderung als erstes bemerken? Was würde diese Person sagen?',
            'Gibt es ein konkretes Ereignis, auf das du hinarbeitest? (Hochzeit, Urlaub, Klassentreffen, Fotoshooting...)',
            'Wenn du an den Moment denkst, als du dachtest "Jetzt muss sich was ändern" – was war da gerade passiert?',
            'Was wäre in einem Jahr anders, wenn du dieses Ziel NIE erreichst? Wie würde sich das anfühlen?',
            'Mal ehrlich unter uns: Geht es dir eher ums Aussehen, ums Gefühl, oder um etwas ganz anderes?',
          ],
        },
      },
      {
        id: 'previous_experience',
        label: 'Bisherige Erfahrung',
        placeholder: 'Was wurde schon versucht?',
        multiline: true,
        deepQuestions: {
          title: 'Tiefenfragen bei "hat nicht funktioniert"',
          questions: [
            'Wenn du an deine beste Fitnessphase denkst – was war damals anders in deinem Leben?',
            'Was war der konkrete Moment, an dem du beim letzten Versuch aufgehört hast? Was ist da passiert?',
            'Was hat dich bisher immer wieder rausgebracht? (Stress, Verletzung, Langeweile, Zeitmangel...)',
            'Gab es etwas, das früher gut funktioniert hat, aber jetzt nicht mehr passt?',
            'Was müsste diesmal anders sein, damit es klappt?',
          ],
        },
      },
    ],
  },
  {
    id: 'ist_zustand',
    title: 'Ist-Zustand',
    duration: '10 Min',
    icon: '📊',
    description: 'Alltag, Training & Ernährung erfassen',
    prompts: [
      'Was arbeitest du? Wie sieht dein Alltag aus?',
      'Wie viel bewegst du dich außerhalb vom Training?',
      'Wie schläfst du? Wie viel Stress hast du?',
      'Wie sieht dein aktuelles Training aus?',
      'Wie ernährst du dich so grob?',
    ],
    fields: [
      {
        id: 'occupation',
        label: 'Beruf & Arbeitszeit',
        placeholder: 'Büro, Schichtdienst, körperlich...',
        isClientField: true,
      },
      {
        id: 'stress_level',
        label: 'Stresslevel',
        placeholder: 'niedrig / mittel / hoch – Ursachen?',
        deepQuestions: {
          title: 'Tiefenfragen wenn Stress unterschätzt wird',
          questions: [
            'Wie oft denkst du abends noch an die Arbeit, wenn du eigentlich abschalten willst?',
            'Wann hattest du zuletzt einen Tag, an dem du an GAR NICHTS gedacht hast?',
            'Wie würde dein Partner / dein bester Freund deinen Stresslevel einschätzen?',
            'Was machst du, um runterzukommen? Funktioniert das?',
            'Merkst du Stress eher im Kopf (Gedankenkreisen) oder im Körper (Verspannungen, Schlaf)?',
          ],
        },
      },
      {
        id: 'sleep_quality',
        label: 'Schlaf',
        placeholder: 'Stunden, Qualität, Probleme?',
        deepQuestions: {
          title: 'Tiefenfragen zur Schlafqualität',
          questions: [
            'Wie fühlst du dich morgens, wenn der Wecker klingelt? Fit oder wie gerädert?',
            'Brauchst du Kaffee, um morgens in die Gänge zu kommen?',
            'Wie oft wachst du nachts auf? Kannst du dann wieder einschlafen?',
            'Schläfst du am Wochenende deutlich länger als unter der Woche?',
            'Wann bist du das letzte Mal ohne Wecker aufgewacht und fühltest dich ausgeschlafen?',
          ],
        },
      },
      {
        id: 'daily_activity',
        label: 'Bewegung im Alltag',
        placeholder: 'Schritte, Fahrrad, Treppen...',
      },
      {
        id: 'current_training',
        label: 'Aktuelles Training',
        placeholder: 'Häufigkeit, Art, seit wann?',
        deepQuestions: {
          title: 'Tiefenfragen bei Selbstüberschätzung',
          questions: [
            'Was war dein letztes Training – welcher Tag, welche Uhrzeit, was genau hast du gemacht?',
            'Wenn du an die letzten 4 Wochen denkst – wie viele Trainingseinheiten waren es wirklich?',
            'Wie lange dauert ein typisches Training bei dir – von Betreten bis Verlassen?',
            'Was machst du in einer typischen Einheit? Beschreib mir den Ablauf.',
          ],
        },
      },
      {
        id: 'nutrition_habits',
        label: 'Ernährung (grob)',
        placeholder: 'Regelmäßig? Kantine? Selbst kochen?',
        deepQuestions: {
          title: 'Tiefenfragen bei "ich esse eigentlich gesund"',
          questions: [
            'Was hast du GESTERN gegessen? Frühstück, Mittag, Abend, Snacks – so konkret wie möglich.',
            'Wie sieht ein typischer Dienstag bei dir aus – vom Aufstehen bis Schlafengehen, inklusive Essen?',
            'Wann isst du aus echtem Hunger, und wann aus anderen Gründen? (Langeweile, Stress, Gewohnheit)',
            'Wie oft bestellst du Essen oder isst auswärts pro Woche?',
            'Trinkst du Kalorien? (Softdrinks, Säfte, Alkohol, Kaffee mit Milch/Zucker)',
            'Gibt es Lebensmittel, bei denen du nicht aufhören kannst, wenn du einmal angefangen hast?',
          ],
        },
      },
    ],
  },
  {
    id: 'gesundheit',
    title: 'Gesundheit',
    duration: '10 Min',
    icon: '🩺',
    description: 'Anamnese – wichtig für sicheres Training',
    prompts: [
      'Gibt es Erkrankungen, die ich wissen sollte?',
      'Hattest du Operationen oder Verletzungen?',
      'Nimmst du regelmäßig Medikamente?',
      'Gibt es Bewegungseinschränkungen oder Schmerzen?',
      'Rauchst du? Trinkst du regelmäßig Alkohol?',
    ],
    fields: [],
    isHealthSection: true,
  },
  {
    id: 'ziele',
    title: 'Ziele & Wünsche',
    duration: '10 Min',
    icon: '🎯',
    description: 'Das eigentliche Warum verstehen',
    prompts: [
      'Was möchtest du erreichen?',
      'Warum ist dir das wichtig?',
      'Woran würdest du merken, dass es funktioniert?',
      'Gibt es einen Zeitrahmen?',
    ],
    fields: [
      {
        id: 'fitness_goal_text',
        label: 'Primärziel',
        placeholder: 'Das wichtigste Ziel...',
        isClientField: true,
      },
      {
        id: 'goal_importance',
        label: 'Warum wichtig?',
        placeholder: 'Die tiefere Motivation...',
        multiline: true,
        deepQuestions: {
          title: 'Das "Warum hinter dem Warum" finden',
          questions: [
            'Was passiert, wenn du in einem Jahr immer noch genau da stehst, wo du heute bist?',
            'Auf einer Skala von 1-10: Wie wichtig ist dir das WIRKLICH? ... Warum keine 10?',
            'Was bist du bereit, dafür aufzugeben oder zu verändern?',
            'Wofür brauchst du die zusätzliche Energie/Kraft/Ausdauer konkret?',
            'Gibt es jemanden, für den du das auch tust? (Kinder, Partner, Eltern)',
            'Was würdest du machen, wenn du fitter wärst, das du jetzt nicht machst?',
          ],
        },
      },
      {
        id: 'success_criteria',
        label: 'Woran erkennbar?',
        placeholder: 'Konkretes Erfolgskriterium...',
        deepQuestions: {
          title: 'Konkrete Erfolgskriterien herausarbeiten',
          questions: [
            'Woran würde dein bester Freund / dein Partner merken, dass es funktioniert hat?',
            'Gibt es ein konkretes Kleidungsstück, das wieder passen soll?',
            'Gibt es eine Zahl, die du im Kopf hast? (Gewicht, Körperfett, Wiederholungen...)',
            'Gibt es ein Gefühl, das du wieder haben möchtest? Beschreib es mir.',
            'Was müsste passieren, damit du nach 3 Monaten sagst: Das hat sich gelohnt?',
            'Stell dir vor, wir treffen uns in 6 Monaten – was erzählst du mir, was sich verändert hat?',
          ],
        },
      },
    ],
  },
  {
    id: 'ausblick',
    title: 'Ausblick',
    duration: '5 Min',
    icon: '🚀',
    description: 'Nächste Schritte & Einschätzung',
    prompts: [
      'Nächste Schritte erklären (Probetraining)',
      'Offene Fragen klären',
      'Termin vereinbaren',
    ],
    fields: [
      { id: 'next_steps', label: 'Vereinbart', placeholder: 'Probetraining am...' },
      { id: 'notes', label: 'Notizen', placeholder: 'Sonstiges, Besonderheiten...', multiline: true },
    ],
  },
];

const HEALTH_QUESTIONS = [
  { id: 'cardiovascular', label: 'Herz-Kreislauf', placeholder: 'Bluthochdruck, Herzrhythmusstörungen...', examples: 'z.B. Bluthochdruck, Herzinfarkt' },
  { id: 'musculoskeletal', label: 'Bewegungsapparat', placeholder: 'Rücken, Gelenke, Bandscheiben...', examples: 'z.B. Bandscheibenvorfall, Arthrose' },
  { id: 'surgeries', label: 'Frühere Operationen', placeholder: 'Welche OPs, wann?', examples: 'z.B. Kreuzband 2019' },
  { id: 'sports_injuries', label: 'Sportverletzungen', placeholder: 'Alte Verletzungen...', examples: 'z.B. Bänderriss, Muskelfaserriss' },
  { id: 'other_conditions', label: 'Sonstige Erkrankungen', placeholder: 'Diabetes, Schilddrüse, Asthma...', examples: 'z.B. Diabetes, Allergien' },
  { id: 'medications', label: 'Medikamente', placeholder: 'Regelmäßige Einnahme?', examples: 'z.B. Beta-Blocker, Schmerzmittel' },
  { id: 'current_pain', label: 'Aktuelle Schmerzen', placeholder: 'Was tut weh? Was geht nicht?', examples: 'z.B. Schulter beim Überkopf' },
  { id: 'substances', label: 'Genussmittel', placeholder: 'Rauchen, Alkohol...', examples: 'z.B. 10 Zig./Tag, 2-3 Bier am WE' },
];

const PERSONALITY_TYPES = [
  { id: 'success_oriented', label: 'Erfolgsorientiert', icon: '⚡', traits: ['Optimistisch', 'Aktiv', 'Zielorientiert'], strategy: 'Herausfordernde Ziele, Eigenverantwortung betonen' },
  { id: 'avoidance_oriented', label: 'Meidungsorientiert', icon: '🛡️', traits: ['Vorsichtig', 'Braucht Sicherheit'], strategy: 'Realistische Erwartungen, mehr Begleitung' },
  { id: 'unclear', label: 'Noch unklar', icon: '❓', traits: ['Weitere Beobachtung'], strategy: 'Im Probetraining genauer beobachten' },
];

const FITNESS_GOALS = ['Abnehmen', 'Muskelaufbau', 'Ausdauer', 'Reha', 'Allgemeine Fitness', 'Wettkampfvorbereitung'];
const ACQUISITION_SOURCES = ['Empfehlung', 'Instagram', 'Website', 'Google', 'Laufkundschaft', 'Sonstiges'];

// ============================================
// DEEP QUESTIONS COMPONENT
// ============================================

interface DeepQuestionsProps {
  title: string;
  questions: string[];
}

const DeepQuestionsPanel: React.FC<DeepQuestionsProps> = ({ title, questions }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-xs text-primary hover:text-primary/80 transition-colors"
      >
        <Lightbulb className="w-3.5 h-3.5" />
        <span>{isOpen ? 'Tiefenfragen ausblenden' : 'Tiefenfragen anzeigen'}</span>
        {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {isOpen && (
        <div className="mt-2 p-3 rounded-lg bg-primary/5 border border-primary/20 space-y-2">
          <p className="text-xs font-medium text-primary">{title}</p>
          <ul className="space-y-1.5">
            {questions.map((q, idx) => (
              <li key={idx} className="text-sm text-muted-foreground flex gap-2">
                <span className="text-primary/60 flex-shrink-0">→</span>
                <span>{q}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

// ============================================
// DUO FIELD: renders one field for both clients interleaved
// ============================================

interface DuoFieldProps {
  field: FieldConfig;
  formData: Record<string, string>;
  updateField: (id: string, value: string) => void;
  nameA: string;
  nameB: string;
}

const DuoField: React.FC<DuoFieldProps> = ({ field, formData, updateField, nameA, nameB }) => {
  const idA = field.id + '_a';
  const idB = field.id + '_b';

  const renderInput = (id: string, suffix: 'a' | 'b') => {
    const colorA = 'border-l-primary/60';
    const colorB = 'border-l-emerald-500/60';
    const labelColor = suffix === 'a' ? 'text-primary' : 'text-emerald-600';
    const name = suffix === 'a' ? nameA : nameB;

    return (
      <div className={`pl-3 border-l-2 ${suffix === 'a' ? colorA : colorB} space-y-1`}>
        <p className={`text-xs font-semibold ${labelColor}`}>{name}</p>
        {field.multiline ? (
          <Textarea
            value={formData[id] || ''}
            onChange={e => updateField(id, e.target.value)}
            placeholder={field.placeholder}
            rows={2}
          />
        ) : (
          <Input
            value={formData[id] || ''}
            onChange={e => updateField(id, e.target.value)}
            placeholder={field.placeholder}
          />
        )}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-muted-foreground">{field.label}</p>
      {renderInput(idA, 'a')}
      {renderInput(idB, 'b')}
      {field.deepQuestions && (
        <DeepQuestionsPanel title={field.deepQuestions.title} questions={field.deepQuestions.questions} />
      )}
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

interface OnboardingWizardProps {
  clientId?: string;
}

type WizardStep = 'select' | 'new-client' | 'conversation';

export default function OnboardingWizard({ clientId: propClientId }: OnboardingWizardProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { user } = useAuth();

  const clientIdFromUrl = propClientId || searchParams.get('clientId');

  // Wizard state
  const [wizardStep, setWizardStep] = useState<WizardStep>(clientIdFromUrl ? 'conversation' : 'select');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(clientIdFromUrl);
  const [allClients, setAllClients] = useState<any[]>([]);

  // Duo state
  const [isDuo, setIsDuo] = useState(false);
  const [secondClientId, setSecondClientId] = useState<string | null>(null);
  const [secondClientName, setSecondClientName] = useState('');

  // Client form state (for new clients)
  const [clientForm, setClientForm] = useState({
    full_name: '',
    date_of_birth: '',
    email: '',
    phone: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    health_notes: '',
    fitness_goal: '',
    fitness_goal_text: '',
    starting_date: new Date().toISOString().split('T')[0],
    status: 'Active',
    acquisition_source: '',
  });

  // Conversation state
  const [currentPhase, setCurrentPhase] = useState(0);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [clientName, setClientName] = useState('');
  const [personalityType, setPersonalityType] = useState<string | null>(null);
  // Duo: separate personality type per client
  const [personalityTypeA, setPersonalityTypeA] = useState<string | null>(null);
  const [personalityTypeB, setPersonalityTypeB] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [existingClient, setExistingClient] = useState<any>(null);

  useEffect(() => { loadClients(); }, []);

  useEffect(() => {
    if (selectedClientId) loadClient(selectedClientId);
  }, [selectedClientId]);

  useEffect(() => {
    if (secondClientId) loadSecondClient(secondClientId);
  }, [secondClientId]);

  const loadClients = async () => {
    const { data } = await supabase.from('clients').select('id, full_name, status').order('full_name');
    setAllClients(data || []);
  };

  const loadClient = async (id: string) => {
    try {
      const client = await getClient(id);
      if (client) {
        setExistingClient(client);
        setClientName(client.full_name);
        if (client.occupation) setFormData(prev => ({ ...prev, occupation_a: client.occupation }));
        if (client.fitness_goal_text) setFormData(prev => ({ ...prev, fitness_goal_text_a: client.fitness_goal_text }));
      }
    } catch (error) {
      console.error('Fehler beim Laden des Kunden:', error);
    }
  };

  const loadSecondClient = async (id: string) => {
    try {
      const client = await getClient(id);
      if (client) {
        setSecondClientName(client.full_name);
        if (client.occupation) setFormData(prev => ({ ...prev, occupation_b: client.occupation }));
        if (client.fitness_goal_text) setFormData(prev => ({ ...prev, fitness_goal_text_b: client.fitness_goal_text }));
      }
    } catch (error) {
      console.error('Fehler beim Laden des zweiten Kunden:', error);
    }
  };

  const updateField = (fieldId: string, value: string) => {
    setFormData(prev => ({ ...prev, [fieldId]: value }));
  };

  const updateClientForm = (field: string, value: string) => {
    setClientForm(prev => ({ ...prev, [field]: value }));
  };

  const phase = PHASES[currentPhase];
  const progress = ((currentPhase + 1) / PHASES.length) * 100;

  // ── Helpers to extract A/B data from formData ────────────────────────────
  const buildConversationData = (suffix: 'a' | 'b' | ''): ConversationForm => {
    const s = suffix ? '_' + suffix : '';
    return {
      contact_source: formData[`contact_source${s}`],
      motivation: formData[`motivation${s}`],
      previous_experience: formData[`previous_experience${s}`],
      stress_level: formData[`stress_level${s}`],
      sleep_quality: formData[`sleep_quality${s}`],
      daily_activity: formData[`daily_activity${s}`],
      current_training: formData[`current_training${s}`],
      nutrition_habits: formData[`nutrition_habits${s}`],
      goal_importance: formData[`goal_importance${s}`],
      success_criteria: formData[`success_criteria${s}`],
      personality_type: (isDuo
        ? suffix === 'a' ? personalityTypeA : personalityTypeB
        : personalityType) as any,
      next_steps: formData[`next_steps${s}`],
      notes: formData[`notes${s}`],
    };
  };

  const buildHealthData = (suffix: 'a' | 'b' | ''): HealthRecordForm => {
    const s = suffix ? '_' + suffix : '';
    return {
      cardiovascular: formData[`cardiovascular${s}`],
      musculoskeletal: formData[`musculoskeletal${s}`],
      surgeries: formData[`surgeries${s}`],
      sports_injuries: formData[`sports_injuries${s}`],
      other_conditions: formData[`other_conditions${s}`],
      medications: formData[`medications${s}`],
      current_pain: formData[`current_pain${s}`],
      substances: formData[`substances${s}`],
    };
  };

  // ============================================
  // HANDLE CLIENT SELECTION
  // ============================================

  const handleSelectExistingClient = (clientId: string) => {
    setSelectedClientId(clientId);
    // Don't jump to conversation yet – wait to see if duo is toggled
  };

  const handleStartConversation = () => {
    if (!selectedClientId) return;
    if (isDuo && !secondClientId) {
      toast({ title: 'Zweiten Kunden wählen', description: 'Bitte wähle auch den zweiten Teilnehmer.', variant: 'destructive' });
      return;
    }
    setWizardStep('conversation');
  };

  const handleStartNewClient = () => {
    setWizardStep('new-client');
  };

  const handleCreateClientAndContinue = async () => {
    if (!user || !clientForm.full_name.trim()) {
      toast({ title: 'Name erforderlich', description: 'Bitte gib mindestens den Namen des Kunden ein.', variant: 'destructive' });
      return;
    }
    setIsSaving(true);
    try {
      const { data: newClient, error } = await supabase
        .from('clients')
        .insert({
          user_id: user.id,
          full_name: clientForm.full_name,
          date_of_birth: clientForm.date_of_birth || null,
          email: clientForm.email || null,
          phone: clientForm.phone || null,
          whatsapp_link: clientForm.phone ? `https://wa.me/${clientForm.phone.replace(/\D/g, '')}` : null,
          emergency_contact_name: clientForm.emergency_contact_name || null,
          emergency_contact_phone: clientForm.emergency_contact_phone || null,
          health_notes: clientForm.health_notes || null,
          fitness_goal: clientForm.fitness_goal || null,
          fitness_goal_text: clientForm.fitness_goal_text || null,
          starting_date: clientForm.starting_date || null,
          status: 'prospect',
          acquisition_source: clientForm.acquisition_source || null,
        })
        .select()
        .single();

      if (error) throw error;

      setSelectedClientId(newClient.id);
      setExistingClient(newClient);
      setClientName(newClient.full_name);
      if (clientForm.fitness_goal_text) setFormData(prev => ({ ...prev, fitness_goal_text: clientForm.fitness_goal_text }));
      if (clientForm.acquisition_source) setFormData(prev => ({ ...prev, contact_source: clientForm.acquisition_source }));

      setWizardStep('conversation');
      toast({ title: 'Kunde angelegt', description: `${newClient.full_name} wurde erstellt.` });
    } catch (error) {
      console.error('Fehler:', error);
      toast({ title: 'Fehler', description: 'Kunde konnte nicht angelegt werden.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  // ============================================
  // SAVE TO DATABASE
  // ============================================

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Nicht eingeloggt');

      if (isDuo && secondClientId) {
        // ── Duo: save two separate conversations ──────────────────────────
        const suffix_a = 'a';
        const suffix_b = 'b';

        // Client A
        await supabase.from('clients').update({
          occupation: formData.occupation_a,
          fitness_goal_text: formData.fitness_goal_text_a,
          status: 'trial',
        }).eq('id', selectedClientId!);

        const convA = await createConversation(selectedClientId!, buildConversationData(suffix_a));
        await createHealthRecord(selectedClientId!, buildHealthData(suffix_a), convA.id);

        // Client B
        await supabase.from('clients').update({
          occupation: formData.occupation_b,
          fitness_goal_text: formData.fitness_goal_text_b,
          status: 'trial',
        }).eq('id', secondClientId);

        const convB = await createConversation(secondClientId, buildConversationData(suffix_b));
        await createHealthRecord(secondClientId, buildHealthData(suffix_b), convB.id);

        toast({ title: 'Duo-Erstgespräch gespeichert', description: `Daten für ${clientName} & ${secondClientName} wurden gespeichert.` });
        navigate(`/clients/${selectedClientId!}`);

      } else {
        // ── Solo ──────────────────────────────────────────────────────────
        await supabase.from('clients').update({
          occupation: formData.occupation,
          fitness_goal_text: formData.fitness_goal_text,
          status: 'trial',
        }).eq('id', selectedClientId!);

        const conversation = await createConversation(selectedClientId!, buildConversationData(''));
        await createHealthRecord(selectedClientId!, buildHealthData(''), conversation.id);

        toast({ title: 'Erstgespräch gespeichert', description: `Daten für ${clientName} wurden erfolgreich gespeichert.` });
        navigate(`/clients/${selectedClientId!}`);
      }
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
      toast({ title: 'Fehler', description: 'Beim Speichern ist ein Fehler aufgetreten.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  // ============================================
  // RENDER: CLIENT SELECTION
  // ============================================

  if (wizardStep === 'select') {
    const availableForSecond = allClients.filter(c => c.id !== selectedClientId);

    return (
      <div className="max-w-xl mx-auto p-4 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Erstgespräch</h1>
          <p className="text-muted-foreground mt-1">Für wen möchtest du das Erstgespräch führen?</p>
        </div>

        <div className="grid gap-4">
          {/* Existing Client */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-5 h-5" />
                Kunden auswählen
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select onValueChange={handleSelectExistingClient}>
                <SelectTrigger>
                  <SelectValue placeholder="Kunde A auswählen..." />
                </SelectTrigger>
                <SelectContent>
                  {allClients.map(client => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.full_name}
                      {client.status === 'prospect' && (
                        <span className="ml-2 text-xs text-muted-foreground">(Interessent)</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Duo toggle – only show if a client is selected */}
              {selectedClientId && (
                <div className="space-y-3 pt-2 border-t border-border">
                  <div className="flex items-center gap-3">
                    <Switch checked={isDuo} onCheckedChange={v => { setIsDuo(v); if (!v) { setSecondClientId(null); setSecondClientName(''); } }} />
                    <Label className="text-sm">Duo-Erstgespräch (zwei Personen)</Label>
                  </div>
                  {isDuo && (
                    <Select onValueChange={setSecondClientId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Kunde B auswählen..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availableForSecond.map(client => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}

              {selectedClientId && (
                <Button
                  className="w-full"
                  onClick={handleStartConversation}
                  disabled={isDuo && !secondClientId}
                >
                  {isDuo ? `Duo-Erstgespräch starten →` : 'Erstgespräch starten →'}
                </Button>
              )}

              {allClients.length === 0 && (
                <p className="text-sm text-muted-foreground">Noch keine Kunden vorhanden.</p>
              )}
            </CardContent>
          </Card>

          {/* New Client */}
          <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={handleStartNewClient}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <UserPlus className="w-5 h-5" />
                Neuen Kunden anlegen
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Lege zuerst die Stammdaten an, dann führst du das Erstgespräch.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER: NEW CLIENT FORM
  // ============================================

  if (wizardStep === 'new-client') {
    return (
      <div className="max-w-2xl mx-auto p-4 space-y-6">
        <Button variant="ghost" onClick={() => setWizardStep('select')} className="gap-2">
          <ArrowLeft className="w-4 h-4" /> Zurück
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Neuer Kunde</h1>
          <p className="text-muted-foreground mt-1">Erfasse die Stammdaten, dann geht's zum Erstgespräch.</p>
        </div>
        <Card>
          <CardHeader><CardTitle className="text-base">Persönliche Daten</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Vollständiger Name *</Label>
                <Input value={clientForm.full_name} onChange={e => updateClientForm('full_name', e.target.value)} placeholder="Max Mustermann" />
              </div>
              <div className="space-y-2">
                <Label>Geburtsdatum</Label>
                <Input type="date" value={clientForm.date_of_birth} onChange={e => updateClientForm('date_of_birth', e.target.value)} />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>E-Mail</Label>
                <Input type="email" value={clientForm.email} onChange={e => updateClientForm('email', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Telefon (mit Vorwahl)</Label>
                <Input value={clientForm.phone} onChange={e => updateClientForm('phone', e.target.value)} placeholder="+49..." />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Notfallkontakt</CardTitle></CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={clientForm.emergency_contact_name} onChange={e => updateClientForm('emergency_contact_name', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Telefon</Label>
              <Input value={clientForm.emergency_contact_phone} onChange={e => updateClientForm('emergency_contact_phone', e.target.value)} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Trainingsdetails</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fitnessziel</Label>
                <Select value={clientForm.fitness_goal} onValueChange={v => updateClientForm('fitness_goal', v)}>
                  <SelectTrigger><SelectValue placeholder="Ziel wählen" /></SelectTrigger>
                  <SelectContent>{FITNESS_GOALS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Wie hat er/sie mich gefunden?</Label>
                <Select value={clientForm.acquisition_source} onValueChange={v => updateClientForm('acquisition_source', v)}>
                  <SelectTrigger><SelectValue placeholder="Quelle wählen" /></SelectTrigger>
                  <SelectContent>{ACQUISITION_SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Ziel-Details (Freitext)</Label>
              <Textarea value={clientForm.fitness_goal_text} onChange={e => updateClientForm('fitness_goal_text', e.target.value)} rows={2} placeholder="Was möchte der Kunde erreichen?" />
            </div>
          </CardContent>
        </Card>
        <div className="flex justify-end">
          <Button onClick={handleCreateClientAndContinue} disabled={isSaving || !clientForm.full_name.trim()}>
            {isSaving ? 'Wird angelegt...' : 'Kunde anlegen & Erstgespräch starten →'}
          </Button>
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER: SUMMARY
  // ============================================

  if (showSummary) {
    return (
      <div className="max-w-2xl mx-auto p-4 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>
              Zusammenfassung: {clientName}{isDuo && secondClientName ? ` & ${secondClientName}` : ''}
            </CardTitle>
            <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString('de-DE')}</p>
          </CardHeader>
          <CardContent className="space-y-6">

            {/* Personality types */}
            {isDuo ? (
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  { name: clientName, type: personalityTypeA, color: 'border-primary/30 bg-primary/5' },
                  { name: secondClientName, type: personalityTypeB, color: 'border-emerald-300 bg-emerald-50' },
                ].map(({ name, type, color }) => {
                  const pt = PERSONALITY_TYPES.find(t => t.id === type);
                  return pt ? (
                    <div key={name} className={`p-3 rounded-lg border ${color}`}>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">{name}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{pt.icon}</span>
                        <span className="font-medium text-sm">{pt.label}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{pt.strategy}</p>
                    </div>
                  ) : null;
                })}
              </div>
            ) : (
              (() => {
                const selectedType = PERSONALITY_TYPES.find(t => t.id === personalityType);
                return selectedType ? (
                  <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">{selectedType.icon}</span>
                      <span className="font-semibold">{selectedType.label}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{selectedType.strategy}</p>
                  </div>
                ) : null;
              })()
            )}

            {/* Field summary */}
            {PHASES.filter(p => p.fields.length > 0 || p.isHealthSection).map(p => (
              <div key={p.id} className="space-y-2">
                <h3 className="font-medium flex items-center gap-2"><span>{p.icon}</span> {p.title}</h3>
                <div className="pl-4 space-y-2 text-sm">
                  {p.isHealthSection ? (
                    isDuo ? (
                      HEALTH_QUESTIONS.map(q => {
                        const vA = formData[q.id + '_a'];
                        const vB = formData[q.id + '_b'];
                        if (!vA && !vB) return null;
                        return (
                          <div key={q.id}>
                            <p className="text-muted-foreground text-xs font-medium">{q.label}</p>
                            {vA && <p className="ml-2"><span className="text-primary text-xs">{clientName}:</span> {vA}</p>}
                            {vB && <p className="ml-2"><span className="text-emerald-600 text-xs">{secondClientName}:</span> {vB}</p>}
                          </div>
                        );
                      })
                    ) : (
                      HEALTH_QUESTIONS.filter(q => formData[q.id]).map(q => (
                        <div key={q.id}>
                          <span className="text-muted-foreground">{q.label}:</span>{' '}
                          <span>{formData[q.id]}</span>
                        </div>
                      ))
                    )
                  ) : (
                    isDuo ? (
                      p.fields.map(field => {
                        const vA = formData[field.id + '_a'];
                        const vB = formData[field.id + '_b'];
                        if (!vA && !vB) return null;
                        return (
                          <div key={field.id}>
                            <p className="text-muted-foreground text-xs font-medium">{field.label}</p>
                            {vA && <p className="ml-2"><span className="text-primary text-xs">{clientName}:</span> {vA}</p>}
                            {vB && <p className="ml-2"><span className="text-emerald-600 text-xs">{secondClientName}:</span> {vB}</p>}
                          </div>
                        );
                      })
                    ) : (
                      p.fields.map(field => (
                        <div key={field.id}>
                          <span className="text-muted-foreground">{field.label}:</span>{' '}
                          <span>{formData[field.id] || '—'}</span>
                        </div>
                      ))
                    )
                  )}
                </div>
              </div>
            ))}

            <div className="flex gap-3 pt-4">
              <Button variant="outline" onClick={() => setShowSummary(false)} className="flex-1">← Zurück bearbeiten</Button>
              <Button onClick={handleSave} disabled={isSaving} className="flex-1">
                {isSaving ? 'Speichert...' : '💾 Speichern'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ============================================
  // RENDER: CONVERSATION WIZARD
  // ============================================

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">

      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">
              {isDuo ? 'Duo-Erstgespräch' : 'Erstgespräch'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {clientName}{isDuo && secondClientName ? ` & ${secondClientName}` : ''}
            </p>
          </div>
          <span className="text-sm text-muted-foreground">{new Date().toLocaleDateString('de-DE')}</span>
        </div>

        {/* Duo badge */}
        {isDuo && (
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">
              <span className="w-2 h-2 rounded-full bg-primary inline-block" /> {clientName}
            </span>
            <span className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> {secondClientName}
            </span>
          </div>
        )}

        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <div className="h-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Phase Navigation */}
      <div className="flex flex-wrap gap-1 pb-2">
        {PHASES.map((p, idx) => (
          <Button
            key={p.id}
            variant={idx === currentPhase ? 'default' : idx < currentPhase ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setCurrentPhase(idx)}
            className="flex-shrink-0 text-xs sm:text-sm"
          >
            <span className="mr-1">{p.icon}</span>
            <span className="hidden sm:inline">{p.title}</span>
          </Button>
        ))}
      </div>

      {/* Current Phase */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{phase.icon}</span>
              <div>
                <CardTitle>{phase.title}</CardTitle>
                <p className="text-sm text-muted-foreground">{phase.description}</p>
              </div>
            </div>
            <span className="text-sm bg-secondary px-3 py-1 rounded-full">{phase.duration}</span>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Prompts */}
          <div className="p-4 bg-secondary/50 rounded-lg">
            <h3 className="text-sm font-medium mb-2">💡 Gesprächsimpulse</h3>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {phase.prompts.map((prompt, idx) => (
                <li key={idx}>• {prompt}</li>
              ))}
            </ul>
          </div>

          {/* Input Fields */}
          {phase.fields.length > 0 && (
            <div className="space-y-5">
              <h3 className="text-sm font-medium">✏️ Quick-Capture</h3>
              {isDuo ? (
                // ── DUO: interleaved A/B per field ──────────────────────
                phase.fields.map(field => (
                  <DuoField
                    key={field.id}
                    field={field}
                    formData={formData}
                    updateField={updateField}
                    nameA={clientName}
                    nameB={secondClientName}
                  />
                ))
              ) : (
                // ── SOLO ─────────────────────────────────────────────────
                phase.fields.map(field => (
                  <div key={field.id}>
                    <label className="text-sm text-muted-foreground">{field.label}</label>
                    {field.multiline ? (
                      <Textarea
                        value={formData[field.id] || ''}
                        onChange={e => updateField(field.id, e.target.value)}
                        placeholder={field.placeholder}
                        rows={3}
                      />
                    ) : (
                      <Input
                        value={formData[field.id] || ''}
                        onChange={e => updateField(field.id, e.target.value)}
                        placeholder={field.placeholder}
                      />
                    )}
                    {field.deepQuestions && (
                      <DeepQuestionsPanel title={field.deepQuestions.title} questions={field.deepQuestions.questions} />
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* Health Section */}
          {phase.isHealthSection && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium">🩺 Anamnese-Erfassung</h3>
              <p className="text-xs text-muted-foreground">Nur ausfüllen, was relevant ist.</p>
              {isDuo ? (
                // ── DUO: interleaved A/B per health question ─────────────
                HEALTH_QUESTIONS.map(q => (
                  <div key={q.id} className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">{q.label}</p>
                    <p className="text-xs text-muted-foreground/70">{q.examples}</p>
                    {/* A */}
                    <div className="pl-3 border-l-2 border-primary/60 space-y-1">
                      <p className="text-xs font-semibold text-primary">{clientName}</p>
                      <Input
                        value={formData[q.id + '_a'] || ''}
                        onChange={e => updateField(q.id + '_a', e.target.value)}
                        placeholder={q.placeholder}
                      />
                    </div>
                    {/* B */}
                    <div className="pl-3 border-l-2 border-emerald-500/60 space-y-1">
                      <p className="text-xs font-semibold text-emerald-600">{secondClientName}</p>
                      <Input
                        value={formData[q.id + '_b'] || ''}
                        onChange={e => updateField(q.id + '_b', e.target.value)}
                        placeholder={q.placeholder}
                      />
                    </div>
                  </div>
                ))
              ) : (
                // ── SOLO ─────────────────────────────────────────────────
                HEALTH_QUESTIONS.map(q => (
                  <div key={q.id}>
                    <label className="text-sm text-muted-foreground">{q.label}</label>
                    <Input
                      value={formData[q.id] || ''}
                      onChange={e => updateField(q.id, e.target.value)}
                      placeholder={q.placeholder}
                    />
                    <p className="text-xs text-muted-foreground mt-0.5">{q.examples}</p>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Personality Type (last phase) */}
          {currentPhase === PHASES.length - 1 && (
            <div className="space-y-3 pt-4 border-t">
              {isDuo ? (
                // ── DUO: one picker per client ───────────────────────────
                <>
                  <h3 className="text-sm font-medium">🧠 Persönlichkeitstyp-Einschätzung</h3>
                  {[
                    { label: clientName, value: personalityTypeA, setter: setPersonalityTypeA, color: 'border-primary bg-primary/10', activeColor: 'border-primary bg-primary/10' },
                    { label: secondClientName, value: personalityTypeB, setter: setPersonalityTypeB, color: 'border-emerald-500 bg-emerald-50', activeColor: 'border-emerald-500 bg-emerald-50' },
                  ].map(({ label, value, setter, activeColor }) => (
                    <div key={label} className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
                      {PERSONALITY_TYPES.map(type => (
                        <button
                          key={type.id}
                          onClick={() => setter(type.id)}
                          className={`w-full p-3 rounded-lg text-left border transition ${value === type.id ? activeColor : 'border-border hover:border-primary/50'}`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-lg">{type.icon}</span>
                            <span className="font-medium text-sm">{type.label}</span>
                          </div>
                          <div className="flex gap-1 mt-1">
                            {type.traits.map(trait => (
                              <span key={trait} className="text-xs bg-secondary px-2 py-0.5 rounded">{trait}</span>
                            ))}
                          </div>
                        </button>
                      ))}
                    </div>
                  ))}
                </>
              ) : (
                // ── SOLO ─────────────────────────────────────────────────
                <>
                  <h3 className="text-sm font-medium">🧠 Persönlichkeitstyp-Einschätzung</h3>
                  {PERSONALITY_TYPES.map(type => (
                    <button
                      key={type.id}
                      onClick={() => setPersonalityType(type.id)}
                      className={`w-full p-4 rounded-lg text-left border transition ${personalityType === type.id ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xl">{type.icon}</span>
                        <span className="font-medium">{type.label}</span>
                      </div>
                      <div className="flex gap-1 mt-1">
                        {type.traits.map(trait => (
                          <span key={trait} className="text-xs bg-secondary px-2 py-0.5 rounded">{trait}</span>
                        ))}
                      </div>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={() => setCurrentPhase(Math.max(0, currentPhase - 1))}
          disabled={currentPhase === 0}
          className="flex-1"
        >
          ← Zurück
        </Button>
        {currentPhase < PHASES.length - 1 ? (
          <Button onClick={() => setCurrentPhase(currentPhase + 1)} className="flex-1">Weiter →</Button>
        ) : (
          <Button onClick={() => setShowSummary(true)} className="flex-1">Zusammenfassung →</Button>
        )}
      </div>
    </div>
  );
}
