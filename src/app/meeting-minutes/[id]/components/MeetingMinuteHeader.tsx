'use client';
import { useRouter } from 'next/navigation';
import { AppHeader } from '@/components/ui/app-header';
import { FileText } from 'lucide-react';

interface Props {
  title: string;
  date: string;
  typeLabel?: string;
  recordedBy?: string;
}

export default function MeetingMinuteHeader({
  title,
  date,
  typeLabel,
  recordedBy,
}: Props) {
  const router = useRouter();
  return (
    <>
      <AppHeader
        title={title}
        icon={<FileText className="h-5 w-5 text-purple-500" />}
        onBackClick={() => router.push('/meeting-minutes')}
      />
      <div className="flex flex-wrap gap-3 mt-2 px-4">
        <span className="text-sm bg-white/60 text-purple-700 px-3 py-1 rounded-full border border-purple-200">
          {date}
        </span>
        {typeLabel && (
          <span className="text-sm bg-white/60 text-purple-700 px-3 py-1 rounded-full border border-purple-200">
            {typeLabel}
          </span>
        )}
        {recordedBy && (
          <span className="text-sm bg-white/60 text-purple-700 px-3 py-1 rounded-full border border-purple-200">
            {recordedBy}
          </span>
        )}
      </div>
    </>
  );
}
