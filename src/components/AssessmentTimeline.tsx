/**
 * components/assessment/AssessmentTimeline.tsx
 * 
 * Zeigt alle Assessments chronologisch mit Fotos und Änderungen
 */

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, Minus, Calendar, User } from 'lucide-react';
import { getAssessments, getAssessmentWithPhotos } from '@/lib/assessment/api';
import type { ClientMetrics, AssessmentWithPhotos } from '@/types/assessment';

interface AssessmentTimelineProps {
  clientId: string;
  onViewDetails?: (assessmentId: string) => void;
}

export default function AssessmentTimeline({ clientId, onViewDetails }: AssessmentTimelineProps) {
  const [assessments, setAssessments] = useState<ClientMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAssessment, setSelectedAssessment] = useState<AssessmentWithPhotos | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadAssessments();
  }, [clientId]);

  const loadAssessments = async () => {
    setLoading(true);
    try {
      const data = await getAssessments(clientId);
      setAssessments(data);
    } catch (error) {
      console.error('Fehler beim Laden der Assessments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExpand = async (assessmentId: string, recordedAt: string) => {
    if (expandedId === assessmentId) {
      setExpandedId(null);
      setSelectedAssessment(null);
      return;
    }

    try {
      const data = await getAssessmentWithPhotos(clientId, recordedAt);
      setSelectedAssessment(data);
      setExpandedId(assessmentId);
    } catch (error) {
      console.error('Fehler beim Laden der Details:', error);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const renderChange = (label: string, value: number | null, unit: string) => {
    if (value === null || value === 0) return null;

    const isPositive = value > 0;
    const Icon = isPositive ? TrendingUp : TrendingDown;
    const color = label.includes('Körperfett') || label.includes('Taille') || label.includes('Hüfte')
      ? isPositive ? 'text-red-600' : 'text-green-600'
      : isPositive ? 'text-green-600' : 'text-red-600';

    return (
      <div className={`flex items-center gap-1 text-sm ${color}`}>
        <Icon className="w-4 h-4" />
        <span>
          {isPositive ? '+' : ''}{value.toFixed(1)} {unit}
        </span>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (assessments.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Noch keine Assessments vorhanden</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {assessments.map((assessment, index) => {
        const isExpanded = expandedId === assessment.id;
        const isLatest = index === 0;

        return (
          <Card key={assessment.id} className={isLatest ? 'border-primary' : ''}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <CardTitle className="text-base">{formatDate(assessment.recorded_at)}</CardTitle>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant={assessment.recorded_by === 'coach' ? 'default' : 'secondary'} className="text-xs">
                        {assessment.recorded_by === 'coach' ? 'Coach' : 'Kunde'}
                      </Badge>
                      {isLatest && <Badge variant="outline" className="text-xs">Neuestes</Badge>}
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleExpand(assessment.id, assessment.recorded_at)}
                >
                  {isExpanded ? 'Weniger' : 'Details'}
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Metriken-Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {assessment.weight_kg && (
                  <div>
                    <p className="text-xs text-muted-foreground">Gewicht</p>
                    <p className="text-lg font-semibold">{assessment.weight_kg} kg</p>
                  </div>
                )}
                {assessment.body_fat_percent && (
                  <div>
                    <p className="text-xs text-muted-foreground">Körperfett</p>
                    <p className="text-lg font-semibold">{assessment.body_fat_percent}%</p>
                  </div>
                )}
                {assessment.waist_cm && (
                  <div>
                    <p className="text-xs text-muted-foreground">Taille</p>
                    <p className="text-lg font-semibold">{assessment.waist_cm} cm</p>
                  </div>
                )}
                {assessment.chest_cm && (
                  <div>
                    <p className="text-xs text-muted-foreground">Brust</p>
                    <p className="text-lg font-semibold">{assessment.chest_cm} cm</p>
                  </div>
                )}
              </div>

              {/* Expanded Details */}
              {isExpanded && selectedAssessment && (
                <div className="space-y-4 pt-4 border-t">
                  
                  {/* Änderungen zum vorherigen Assessment */}
                  {selectedAssessment.changes && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">
                        Änderungen (seit {selectedAssessment.changes.days_since_last} Tagen)
                      </h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {renderChange('Gewicht', selectedAssessment.changes.weight_delta, 'kg')}
                        {renderChange('Körperfett', selectedAssessment.changes.bodyfat_delta, '%')}
                        {renderChange('Brust', selectedAssessment.changes.chest_delta, 'cm')}
                        {renderChange('Taille', selectedAssessment.changes.waist_delta, 'cm')}
                        {renderChange('Hüfte', selectedAssessment.changes.hip_delta, 'cm')}
                        {renderChange('Arm', selectedAssessment.changes.arm_delta, 'cm')}
                        {renderChange('Oberschenkel', selectedAssessment.changes.thigh_delta, 'cm')}
                      </div>
                    </div>
                  )}

                  {/* Alle Umfänge */}
                  {(assessment.hip_cm || assessment.arm_cm || assessment.thigh_cm) && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Weitere Umfänge</h4>
                      <div className="grid grid-cols-3 gap-3 text-sm">
                        {assessment.hip_cm && <div><span className="text-muted-foreground">Hüfte:</span> {assessment.hip_cm} cm</div>}
                        {assessment.arm_cm && <div><span className="text-muted-foreground">Arm:</span> {assessment.arm_cm} cm</div>}
                        {assessment.thigh_cm && <div><span className="text-muted-foreground">Oberschenkel:</span> {assessment.thigh_cm} cm</div>}
                      </div>
                    </div>
                  )}

                  {/* Caliper-Werte */}
                  {(assessment.caliper_triceps_mm || assessment.caliper_suprailiac_mm || assessment.caliper_thigh_mm) && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Caliper-Messungen</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                        {assessment.caliper_triceps_mm && <div>Trizeps: {assessment.caliper_triceps_mm} mm</div>}
                        {assessment.caliper_suprailiac_mm && <div>Beckenkamm: {assessment.caliper_suprailiac_mm} mm</div>}
                        {assessment.caliper_thigh_mm && <div>Oberschenkel: {assessment.caliper_thigh_mm} mm</div>}
                        {assessment.caliper_chest_mm && <div>Brust: {assessment.caliper_chest_mm} mm</div>}
                        {assessment.caliper_midaxillary_mm && <div>Mittelachsel: {assessment.caliper_midaxillary_mm} mm</div>}
                        {assessment.caliper_subscapular_mm && <div>Schulterblatt: {assessment.caliper_subscapular_mm} mm</div>}
                        {assessment.caliper_abdominal_mm && <div>Bauch: {assessment.caliper_abdominal_mm} mm</div>}
                      </div>
                    </div>
                  )}

                  {/* Fotos */}
                  {selectedAssessment.photos.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Progress-Fotos ({selectedAssessment.photos.length})</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {selectedAssessment.photos.map(photo => (
                          <img
                            key={photo.id}
                            src={photo.photo_url}
                            alt={`Foto vom ${formatDate(photo.taken_at)}`}
                            className="w-full h-32 object-cover rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => window.open(photo.photo_url, '_blank')}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Notizen */}
                  {assessment.notes && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Notizen</h4>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{assessment.notes}</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
