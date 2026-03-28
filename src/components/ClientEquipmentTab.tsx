/**
 * ClientEquipmentTab.tsx
 *
 * Equipment-Profil für einen Kunden.
 * Coach kann auswählen, welches Equipment dem Kunden zur Verfügung steht.
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Check, X, Dumbbell, Home, Building2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

// ── Types ────────────────────────────────────────────────────────────────────

interface Equipment {
  id: string;
  name: string;
  name_de: string;
  category: string;
  sort_order: number;
}

interface ClientEquipment {
  equipment_id: string;
  location: 'home' | 'gym' | 'both';
}

interface ClientEquipmentTabProps {
  clientId: string;
  clientName: string;
}

// ── Category Labels ──────────────────────────────────────────────────────────

const categoryLabels: Record<string, string> = {
  free_weights: '🏋️ Freie Gewichte',
  machines: '🔧 Maschinen',
  cables: '🔗 Kabelzug',
  bodyweight: '🤸 Körpergewicht',
  cardio: '🏃 Cardio',
  accessories: '🎯 Zubehör',
  specialty: '⭐ Spezial',
};

const locationLabels: Record<string, string> = {
  home: 'Zuhause',
  gym: 'Studio',
  both: 'Beides',
};

const locationIcons: Record<string, React.ReactNode> = {
  home: <Home className="w-3.5 h-3.5" />,
  gym: <Building2 className="w-3.5 h-3.5" />,
  both: <Check className="w-3.5 h-3.5" />,
};

// ── Main Component ───────────────────────────────────────────────────────────

const ClientEquipmentTab: React.FC<ClientEquipmentTabProps> = ({ clientId, clientName }) => {
  const [allEquipment, setAllEquipment] = useState<Equipment[]>([]);
  const [clientEquipment, setClientEquipment] = useState<Map<string, ClientEquipment>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // ── Load Data ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      // Load all equipment
      const { data: equipmentData } = await supabase
        .from('equipment_catalog')
        .select('*')
        .order('sort_order');

      if (equipmentData) {
        setAllEquipment(equipmentData);
        // Set first category as active
        const categories = [...new Set(equipmentData.map(e => e.category))];
        if (categories.length > 0 && !activeCategory) {
          setActiveCategory(categories[0]);
        }
      }

      // Load client's equipment
      const { data: clientData } = await supabase
        .from('client_equipment')
        .select('equipment_id, location')
        .eq('client_id', clientId);

      if (clientData) {
        const map = new Map<string, ClientEquipment>();
        clientData.forEach(ce => map.set(ce.equipment_id, ce));
        setClientEquipment(map);
      }

      setLoading(false);
    };

    load();
  }, [clientId]);

  // ── Toggle Equipment ───────────────────────────────────────────────────────

  const toggleEquipment = async (equipmentId: string, location: 'home' | 'gym' | 'both' | 'remove') => {
    setSaving(true);
    const current = clientEquipment.get(equipmentId);

    try {
      if (location === 'remove') {
        // Remove equipment
        await supabase
          .from('client_equipment')
          .delete()
          .eq('client_id', clientId)
          .eq('equipment_id', equipmentId);

        const updated = new Map(clientEquipment);
        updated.delete(equipmentId);
        setClientEquipment(updated);
      } else if (current) {
        // Update location
        await supabase
          .from('client_equipment')
          .update({ location })
          .eq('client_id', clientId)
          .eq('equipment_id', equipmentId);

        const updated = new Map(clientEquipment);
        updated.set(equipmentId, { equipment_id: equipmentId, location });
        setClientEquipment(updated);
      } else {
        // Add new
        await supabase
          .from('client_equipment')
          .insert({ client_id: clientId, equipment_id: equipmentId, location });

        const updated = new Map(clientEquipment);
        updated.set(equipmentId, { equipment_id: equipmentId, location });
        setClientEquipment(updated);
      }
    } catch (err) {
      console.error(err);
      toast.error('Fehler beim Speichern');
    }

    setSaving(false);
  };

  // ── Filter & Group ─────────────────────────────────────────────────────────

  const categories = [...new Set(allEquipment.map(e => e.category))];
  
  const filteredEquipment = allEquipment.filter(e => {
    const matchesSearch = search === '' || 
      e.name_de.toLowerCase().includes(search.toLowerCase()) ||
      e.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !activeCategory || e.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const selectedCount = clientEquipment.size;
  const homeCount = [...clientEquipment.values()].filter(e => e.location === 'home' || e.location === 'both').length;
  const gymCount = [...clientEquipment.values()].filter(e => e.location === 'gym' || e.location === 'both').length;

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header Stats */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <Dumbbell className="w-4 h-4" />
            Equipment-Profil
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Wähle aus, welches Equipment {clientName.split(' ')[0]} zur Verfügung steht.
            Dies hilft bei der Planerstellung und Übungsauswahl.
          </p>
          <div className="flex gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">{selectedCount}</p>
              <p className="text-xs text-muted-foreground">Gesamt</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-500">{homeCount}</p>
              <p className="text-xs text-muted-foreground">Zuhause</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-500">{gymCount}</p>
              <p className="text-xs text-muted-foreground">Studio</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search & Filter */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Equipment suchen..."
            className="pl-9"
          />
        </div>

        {/* Category Tabs */}
        <div className="flex gap-1 flex-wrap">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeCategory === cat
                  ? 'bg-primary text-white'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {categoryLabels[cat] || cat}
            </button>
          ))}
        </div>
      </div>

      {/* Equipment Grid */}
      <div className="grid sm:grid-cols-2 gap-2">
        {filteredEquipment.map(eq => {
          const clientEq = clientEquipment.get(eq.id);
          const isSelected = !!clientEq;

          return (
            <div
              key={eq.id}
              className={`rounded-xl border p-3 transition-all ${
                isSelected
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-card hover:border-muted-foreground/30'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${isSelected ? 'text-primary' : ''}`}>
                    {eq.name_de}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{eq.name}</p>
                </div>

                {isSelected && clientEq && (
                  <Badge variant="outline" className="text-[10px] flex-shrink-0 gap-1">
                    {locationIcons[clientEq.location]}
                    {locationLabels[clientEq.location]}
                  </Badge>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-1 mt-2">
                {!isSelected ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 h-7 text-xs gap-1"
                      onClick={() => toggleEquipment(eq.id, 'home')}
                      disabled={saving}
                    >
                      <Home className="w-3 h-3" /> Zuhause
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 h-7 text-xs gap-1"
                      onClick={() => toggleEquipment(eq.id, 'gym')}
                      disabled={saving}
                    >
                      <Building2 className="w-3 h-3" /> Studio
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 h-7 text-xs gap-1"
                      onClick={() => toggleEquipment(eq.id, 'both')}
                      disabled={saving}
                    >
                      <Check className="w-3 h-3" /> Beides
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant={clientEq?.location === 'home' ? 'default' : 'outline'}
                      className="flex-1 h-7 text-xs gap-1"
                      onClick={() => toggleEquipment(eq.id, 'home')}
                      disabled={saving}
                    >
                      <Home className="w-3 h-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant={clientEq?.location === 'gym' ? 'default' : 'outline'}
                      className="flex-1 h-7 text-xs gap-1"
                      onClick={() => toggleEquipment(eq.id, 'gym')}
                      disabled={saving}
                    >
                      <Building2 className="w-3 h-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant={clientEq?.location === 'both' ? 'default' : 'outline'}
                      className="flex-1 h-7 text-xs gap-1"
                      onClick={() => toggleEquipment(eq.id, 'both')}
                      disabled={saving}
                    >
                      <Check className="w-3 h-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => toggleEquipment(eq.id, 'remove')}
                      disabled={saving}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filteredEquipment.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">Kein Equipment gefunden.</p>
        </div>
      )}
    </div>
  );
};

export default ClientEquipmentTab;
