'use client';

import { use } from 'react';
import MeetingMinuteDetailClient from './MeetingMinuteDetailClient';

interface MeetingMinuteDetailPageProps {
  params: {
    id: string
  }
}

export default function MeetingMinuteDetailPage({ params }: MeetingMinuteDetailPageProps) {
  // paramsをawaitするためにuseフックを使用
  const resolvedParams = use(params);
  return <MeetingMinuteDetailClient meetingMinuteId={resolvedParams.id} />;
} 