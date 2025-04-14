'use client';

import MeetingMinuteDetailClient from './MeetingMinuteDetailClient';

interface MeetingMinuteDetailPageProps {
  params: {
    id: string;
  };
}

export default function MeetingMinuteDetailPage({ params }: MeetingMinuteDetailPageProps) {
  return <MeetingMinuteDetailClient meetingMinuteId={params.id} />;
} 