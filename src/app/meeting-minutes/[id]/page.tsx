import MeetingMinuteDetailClient from './MeetingMinuteDetailClient';

interface Props {
  params: { id: string };
}

export default async function MeetingMinuteDetailPage({ params }: Props) {
  const { id } = await params;
  return <MeetingMinuteDetailClient meetingMinuteId={id} />;
}
