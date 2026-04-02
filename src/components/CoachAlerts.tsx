/**
 * CoachAlerts.tsx
 * 
 * Zeigt wichtige Alerts für den Coach an:
 * - Kunde hat Paket zur Hälfte verbraucht
 * - Kunde ist seit >7 Tagen inaktiv
 * - Paket läuft bald ab
 */

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { Bell, AlertTriangle, Clock, Package, X, RefreshCw, Loader2 } from 'lucide-react';

interface Alert {
  id: string;
  client_id: string;
  alert_type: string;
  priority: string;
  title: string;
  message: string | null;
  action_url: string | null;
  created_at: string;
  client_name?: string;
}

const alertIcons: Record<string, React.ReactNode> = {
  package_halfway: <Package className="w-4 h-4" />,
  inactive: <Clock className="w-4 h-4" />,
  package_expiring: <AlertTriangle className="w-4 h-4" />,
  checkin_due: <Bell className="w-4 h-4" />,
};

const priorityColors: Record<string, string> = {
  high: 'bg-red-500/10 border-red-500/30 text-red-400',
  medium: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
  low: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
};

const CoachAlerts: React.FC = () => {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tableExists, setTableExists] = useState(true);

  const loadAlerts = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    
    try {
      const { data, error } = await supabase
        .from('coach_alerts')
        .select('*')
        .eq('trainer_id', user.id)
        .eq('is_dismissed', false)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        // Tabelle existiert wahrscheinlich noch nicht
        console.log('coach_alerts not available yet:', error.message);
        setTableExists(false);
        setLoading(false);
        return;
      }

      if (data) {
        setAlerts(data.map(a => ({
          ...a,
          client_name: 'Kunde',
        })));
      }
    } catch (err) {
      console.log('Error loading alerts:', err);
      setTableExists(false);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  const generateAlerts = async () => {
    if (!user) return;
    setRefreshing(true);
    
    try {
      // Direkt via RPC die Alert-Generation aufrufen
      await supabase.rpc('generate_coach_alerts', {
        p_trainer_id: user.id,
      });
      await loadAlerts();
    } catch (err) {
      console.log('generate_coach_alerts not available:', err);
    }
    
    setRefreshing(false);
  };

  const dismissAlert = async (alertId: string) => {
    try {
      await supabase
        .from('coach_alerts')
        .update({ is_dismissed: true })
        .eq('id', alertId);
      
      setAlerts(prev => prev.filter(a => a.id !== alertId));
    } catch (err) {
      console.log('Error dismissing alert:', err);
    }
  };

  // Tabelle existiert noch nicht - nichts anzeigen
  if (!tableExists) {
    return null;
  }

  if (loading) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-6 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (alerts.length === 0) {
    return null; // Keine Alerts = nichts anzeigen
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Coach-Alerts</span>
          <Badge variant="secondary" className="text-xs">
            {alerts.length}
          </Badge>
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={generateAlerts}
          disabled={refreshing}
          className="h-7 text-xs"
        >
          {refreshing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
        </Button>
      </div>

      {alerts.map(alert => (
        <Card 
          key={alert.id} 
          className={`border ${priorityColors[alert.priority] || 'border-muted'}`}
        >
          <CardContent className="py-3 px-4">
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 ${
                alert.priority === 'high' ? 'text-red-400' :
                alert.priority === 'medium' ? 'text-amber-400' : 'text-blue-400'
              }`}>
                {alertIcons[alert.alert_type] || <Bell className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{alert.title}</span>
                </div>
                {alert.message && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {alert.message}
                  </p>
                )}
                {alert.action_url && (
                  <Link 
                    to={alert.action_url}
                    className="text-xs text-primary hover:underline mt-1 inline-block"
                  >
                    Zum Kunden →
                  </Link>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => dismissAlert(alert.id)}
                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default CoachAlerts;
const priorityColors: Record<string, string> = {
  high: 'bg-red-500/10 border-red-500/30 text-red-400',
  medium: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
  low: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
};

const CoachAlerts: React.FC = () => {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadAlerts = useCallback(async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('coach_alerts')
      .select(`
        *,
        clients (full_name)
      `)
      .eq('trainer_id', user.id)
      .eq('is_dismissed', false)
      .order('priority', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(10);

    if (data) {
      setAlerts(data.map(a => ({
        ...a,
        client_name: a.clients?.full_name || 'Unbekannt',
      })));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  const generateAlerts = async () => {
    if (!user) return;
    setRefreshing(true);
    
    // Direkt via RPC die Alert-Generation aufrufen
    const { data, error } = await supabase.rpc('generate_coach_alerts', {
      p_trainer_id: user.id,
    });
    
    if (error) {
      console.error('Alert generation error:', error);
    }
    
    await loadAlerts();
    setRefreshing(false);
  };

  const dismissAlert = async (alertId: string) => {
    await supabase
      .from('coach_alerts')
      .update({ is_dismissed: true })
      .eq('id', alertId);
    
    setAlerts(prev => prev.filter(a => a.id !== alertId));
  };

  if (loading) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-6 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (alerts.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Bell className="w-4 h-4" />
            <span className="text-sm">Keine aktuellen Alerts</span>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={generateAlerts}
            disabled={refreshing}
            className="text-xs"
          >
            {refreshing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            <span className="ml-1">Prüfen</span>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Coach-Alerts</span>
          <Badge variant="secondary" className="text-xs">
            {alerts.length}
          </Badge>
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={generateAlerts}
          disabled={refreshing}
          className="h-7 text-xs"
        >
          {refreshing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
        </Button>
      </div>

      {alerts.map(alert => (
        <Card 
          key={alert.id} 
          className={`border ${priorityColors[alert.priority] || 'border-muted'}`}
        >
          <CardContent className="py-3 px-4">
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 ${
                alert.priority === 'high' ? 'text-red-400' :
                alert.priority === 'medium' ? 'text-amber-400' : 'text-blue-400'
              }`}>
                {alertIcons[alert.alert_type] || <Bell className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{alert.title}</span>
                </div>
                {alert.message && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {alert.message}
                  </p>
                )}
                {alert.action_url && (
                  <Link 
                    to={alert.action_url}
                    className="text-xs text-primary hover:underline mt-1 inline-block"
                  >
                    Zum Kunden →
                  </Link>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => dismissAlert(alert.id)}
                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default CoachAlerts;
