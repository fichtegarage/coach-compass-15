/**
 * pages/AssessmentPage.tsx
 * 
 * Hauptseite für Assessment-System
 * Zeigt Formular + Timeline
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Plus, TrendingUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import AssessmentForm from '@/components/assessment/AssessmentForm';
import AssessmentTimeline from '@/components/assessment/AssessmentTimeline';

export default function AssessmentPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [client, setClient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [activeTab, setActiveTab] = useState<'timeline' | 'new'>('timeline');

  useEffect(() => {
    if (clientId) {
      loadClient();
    }
  }, [clientId]);

  const loadClient = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .single();

      if (error) throw error;
      setClient(data);
    } catch (error) {
      console.error('Fehler beim Laden des Kunden:', error);
      navigate('/clients');
    } finally {
      setLoading(false);
    }
  };

  const handleSuccess = () => {
    setShowForm(false);
    setActiveTab('timeline');
    // Timeline wird automatisch aktualisiert via useEffect in der Komponente
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <p>Lädt...</p>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <p>Kunde nicht gefunden</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(`/clients/${clientId}`)}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Assessment</h1>
            <p className="text-muted-foreground">{client.full_name}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'timeline' | 'new')}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="timeline">
            <TrendingUp className="w-4 h-4 mr-2" />
            Verlauf
          </TabsTrigger>
          <TabsTrigger value="new">
            <Plus className="w-4 h-4 mr-2" />
            Neues Assessment
          </TabsTrigger>
        </TabsList>

        {/* Timeline Tab */}
        <TabsContent value="timeline" className="space-y-4">
          <AssessmentTimeline
            clientId={clientId!}
            onViewDetails={(id) => console.log('View details:', id)}
          />
        </TabsContent>

        {/* New Assessment Tab */}
        <TabsContent value="new">
          <AssessmentForm
            clientId={clientId!}
            clientGender={client.gender || 'other'}
            clientDateOfBirth={client.date_of_birth}
            onSuccess={handleSuccess}
            onCancel={() => setActiveTab('timeline')}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
