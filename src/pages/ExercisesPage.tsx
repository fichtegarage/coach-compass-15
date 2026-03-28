/**
 * ExercisesPage.tsx
 *
 * Seite für die globale Übungsdatenbank.
 */

import React from 'react';
import ExerciseLibrary from '@/components/ExerciseLibrary';

const ExercisesPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold">Übungen</h1>
        <p className="text-muted-foreground">
          Verwalte deine Übungsdatenbank für Trainingsplanerstellung
        </p>
      </div>

      <ExerciseLibrary />
    </div>
  );
};

export default ExercisesPage;
