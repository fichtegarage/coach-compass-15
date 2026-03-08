import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { Dumbbell } from 'lucide-react';

const SettingsPage: React.FC = () => {
  const { user } = useAuth();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl md:text-3xl font-display font-bold">Settings</h1>
      <Card>
        <CardHeader><CardTitle className="text-base font-display">Account</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">Logged in as: <span className="text-foreground">{user?.email}</span></p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base font-display">About</CardTitle></CardHeader>
        <CardContent className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10"><Dumbbell className="w-5 h-5 text-primary" /></div>
          <div>
            <p className="font-medium font-display">CoachHub</p>
            <p className="text-xs text-muted-foreground">Personal Training Management · v1.0</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsPage;
