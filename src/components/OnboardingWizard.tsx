import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  saveOnboarding, 
  createConversation, 
  createHealthRecord,
  getClient 
} from '@/lib/onboarding-api';
import type { ConversationForm, HealthRecordForm } from '@/types/onboarding';

// ============================================
// CONFIGURATION
// ============================================

const PHASES = [
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
      { id: 'contact_source', label: 'Kontakt über', placeholder: 'Empfehlung, Instagram, Studio...' },
      { id: 'motivation', label: 'Motivation', placeholder: 'Was treibt ihn/sie an?', multiline: true },
      { id: 'previous_experience', label: 'Bisherige Erfahrung', placeholder: 'Was wurde schon versucht?', multiline: true },
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
      { id: 'occupation', label: 'Beruf & Arbeitszeit', placeholder: 'Büro, Schichtdienst, körperlich...', isClientField: true },
      { id: 'stress_level', label: 'Stresslevel', placeholder: 'niedrig / mittel / hoch – Ursachen?' },
      { id: 'sleep_quality', label: 'Schlaf', placeholder: 'Stunden, Qualität, Probleme?' },
      { id: 'daily_activity', label: 'Bewegung im Alltag', placeholder: 'Schritte, Fahrrad, Treppen...' },
      { id: 'current_training', label: 'Aktuelles Training', placeholder: 'Häufigkeit, Art, seit wann?' },
      { id: 'nutrition_habits', label: 'Ernährung (grob)', placeholder: 'Regelmäßig? Kantine? Selbst kochen?' },
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
      { id: 'fitness_goal_text', label: 'Primärziel', placeholder: 'Das wichtigste Ziel...', isClientField: true },
      { id: 'goal_importance', label: 'Warum wichtig?', placeholder: 'Die tiefere Motivation...', multiline: true },
      { id: 'success_criteria', label: 'Woran erkennbar?', placeholder: 'Konkretes Erfolgskriterium...' },
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

// ============================================
// COMPONENT
// ============================================

interface OnboardingWizardProps {
  clientId?: string; // Optional: Wenn gesetzt, für bestehenden Kunden
}

export default function OnboardingWizard({ clientId: propClientId }: OnboardingWizardProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  
  // Client ID aus Props oder URL-Parameter
  const clientId = propClientId || searchParams.get('clientId');
  
  const [currentPhase, setCurrentPhase] = useState(0);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [clientName, setClientName] = useState('');
  const [personalityType, setPersonalityType] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [existingClient, setExistingClient] = useState<any>(null);

  // Bestehenden Kunden laden
  useEffect(() => {
    if (clientId) {
      loadClient(clientId);
    }
  }, [clientId]);

  const loadClient = async (id: string) => {
    try {
      const client = await getClient(id);
      if (client) {
        setExistingClient(client);
        setClientName(client.full_name);
        // Vorhandene Daten vorausfüllen
        if (client.occupation) setFormData(prev => ({ ...prev, occupation: client.occupation }));
        if (client.fitness_goal_text) setFormData(prev => ({ ...prev, fitness_goal_text: client.fitness_goal_text }));
      }
    } catch (error) {
      console.error('Fehler beim Laden des Kunden:', error);
    }
  };

  const updateField = (fieldId: string, value: string) => {
    setFormData(prev => ({ ...prev, [fieldId]: value }));
  };

  const phase = PHASES[currentPhase];
  const progress = ((currentPhase + 1) / PHASES.length) * 100;

  // ============================================
  // SAVE TO DATABASE
  // ============================================

  const handleSave = async () => {
    setIsSaving(true);
    
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Nicht eingeloggt');

      // Daten aufteilen
      const conversationData: ConversationForm = {
        contact_source: formData.contact_source,
        motivation: formData.motivation,
        previous_experience: formData.previous_experience,
        stress_level: formData.stress_level,
        sleep_quality: formData.sleep_quality,
        daily_activity: formData.daily_activity,
        current_training: formData.current_training,
        nutrition_habits: formData.nutrition_habits,
        goal_importance: formData.goal_importance,
        success_criteria: formData.success_criteria,
        personality_type: personalityType as any,
        next_steps: formData.next_steps,
        notes: formData.notes,
      };

      const healthData: HealthRecordForm = {
        cardiovascular: formData.cardiovascular,
        musculoskeletal: formData.musculoskeletal,
        surgeries: formData.surgeries,
        sports_injuries: formData.sports_injuries,
        other_conditions: formData.other_conditions,
        medications: formData.medications,
        current_pain: formData.current_pain,
        substances: formData.substances,
      };

      let finalClientId = clientId;

      if (existingClient) {
        // Bestehenden Kunden aktualisieren
        await supabase
          .from('clients')
          .update({
            occupation: formData.occupation,
            fitness_goal_text: formData.fitness_goal_text,
          })
          .eq('id', existingClient.id);
        
        finalClientId = existingClient.id;
      } else {
        // Neuen Kunden anlegen
        const { data: newClient, error: clientError } = await supabase
          .from('clients')
          .insert({
            user_id: user.user.id,
            full_name: clientName,
            occupation: formData.occupation,
            fitness_goal_text: formData.fitness_goal_text,
            status: 'prospect',
          })
          .select()
          .single();

        if (clientError) throw clientError;
        finalClientId = newClient.id;
      }

      // Gespräch speichern
      const conversation = await createConversation(finalClientId!, conversationData);

      // Gesundheitsdaten speichern
      await createHealthRecord(finalClientId!, healthData, conversation.id);

      // Status auf "trial" setzen
      await supabase
        .from('clients')
        .update({ status: 'trial' })
        .eq('id', finalClientId);

      toast({
        title: "Erstgespräch gespeichert",
        description: `Daten für ${clientName} wurden erfolgreich gespeichert.`,
      });

      // Zurück zur Kundenübersicht
      navigate(`/clients`);
      
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
      toast({
        title: "Fehler",
        description: "Beim Speichern ist ein Fehler aufgetreten.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // ============================================
  // RENDER: SUMMARY
  // ============================================

  if (showSummary) {
    const selectedType = PERSONALITY_TYPES.find(t => t.id === personalityType);
    
    return (
      <div className="max-w-2xl mx-auto p-4 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Zusammenfassung: {clientName}</CardTitle>
            <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString('de-DE')}</p>
          </CardHeader>
          <CardContent className="space-y-6">
            
            {selectedType && (
              <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">{selectedType.icon}</span>
                  <span className="font-semibold">{selectedType.label}</span>
                </div>
                <p className="text-sm text-muted-foreground">{selectedType.strategy}</p>
              </div>
            )}

            {PHASES.filter(p => p.fields.length > 0 || p.isHealthSection).map(p => (
              <div key={p.id} className="space-y-2">
                <h3 className="font-medium flex items-center gap-2">
                  <span>{p.icon}</span> {p.title}
                </h3>
                <div className="pl-6 space-y-1 text-sm">
                  {p.isHealthSection ? (
                    HEALTH_QUESTIONS.filter(q => formData[q.id]).map(q => (
                      <div key={q.id}>
                        <span className="text-muted-foreground">{q.label}:</span>{' '}
                        <span>{formData[q.id]}</span>
                      </div>
                    ))
                  ) : (
                    p.fields.map(field => (
                      <div key={field.id}>
                        <span className="text-muted-foreground">{field.label}:</span>{' '}
                        <span>{formData[field.id] || '—'}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}

            <div className="flex gap-3 pt-4">
              <Button variant="outline" onClick={() => setShowSummary(false)} className="flex-1">
                ← Zurück bearbeiten
              </Button>
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
  // RENDER: WIZARD
  // ============================================

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Erstgespräch</h1>
            {existingClient ? (
              <p className="text-sm text-muted-foreground">{clientName}</p>
            ) : (
              <Input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Name des Kunden"
                className="mt-1 max-w-xs"
              />
            )}
          </div>
          <span className="text-sm text-muted-foreground">
            {new Date().toLocaleDateString('de-DE')}
          </span>
        </div>
        
        {/* Progress */}
        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <div 
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Phase Navigation */}
      <div className="flex gap-1 overflow-x-auto pb-2">
        {PHASES.map((p, idx) => (
          <Button
            key={p.id}
            variant={idx === currentPhase ? 'default' : idx < currentPhase ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setCurrentPhase(idx)}
            className="flex-shrink-0"
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
            <span className="text-sm bg-secondary px-3 py-1 rounded-full">
              {phase.duration}
            </span>
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
            <div className="space-y-4">
              <h3 className="text-sm font-medium">✏️ Quick-Capture</h3>
              {phase.fields.map(field => (
                <div key={field.id}>
                  <label className="text-sm text-muted-foreground">{field.label}</label>
                  {field.multiline ? (
                    <Textarea
                      value={formData[field.id] || ''}
                      onChange={(e) => updateField(field.id, e.target.value)}
                      placeholder={field.placeholder}
                      rows={3}
                    />
                  ) : (
                    <Input
                      value={formData[field.id] || ''}
                      onChange={(e) => updateField(field.id, e.target.value)}
                      placeholder={field.placeholder}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Health Section */}
          {phase.isHealthSection && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium">🩺 Anamnese-Erfassung</h3>
              <p className="text-xs text-muted-foreground">Nur ausfüllen, was relevant ist.</p>
              {HEALTH_QUESTIONS.map(q => (
                <div key={q.id}>
                  <label className="text-sm text-muted-foreground">{q.label}</label>
                  <Input
                    value={formData[q.id] || ''}
                    onChange={(e) => updateField(q.id, e.target.value)}
                    placeholder={q.placeholder}
                  />
                  <p className="text-xs text-muted-foreground mt-0.5">{q.examples}</p>
                </div>
              ))}
            </div>
          )}

          {/* Personality Type (last phase) */}
          {currentPhase === PHASES.length - 1 && (
            <div className="space-y-3 pt-4 border-t">
              <h3 className="text-sm font-medium">🧠 Persönlichkeitstyp-Einschätzung</h3>
              {PERSONALITY_TYPES.map(type => (
                <button
                  key={type.id}
                  onClick={() => setPersonalityType(type.id)}
                  className={`w-full p-4 rounded-lg text-left border transition ${
                    personalityType === type.id
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">{type.icon}</span>
                    <span className="font-medium">{type.label}</span>
                  </div>
                  <div className="flex gap-1 mt-1">
                    {type.traits.map(trait => (
                      <span key={trait} className="text-xs bg-secondary px-2 py-0.5 rounded">
                        {trait}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
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
          <Button
            onClick={() => setCurrentPhase(currentPhase + 1)}
            className="flex-1"
          >
            Weiter →
          </Button>
        ) : (
          <Button
            onClick={() => setShowSummary(true)}
            disabled={!clientName.trim()}
            className="flex-1"
          >
            Zusammenfassung →
          </Button>
        )}
      </div>
    </div>
  );
}
