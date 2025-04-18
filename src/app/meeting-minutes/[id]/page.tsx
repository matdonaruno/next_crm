import MeetingMinuteDetailClient from './MeetingMinuteDetailClient';

interface MeetingMinuteDetailPageProps {
  params: {
    id: string;
  };
}

export default async function MeetingMinuteDetailPage({ params }: MeetingMinuteDetailPageProps) {
  return <MeetingMinuteDetailClient meetingMinuteId={params.id} />;
} 