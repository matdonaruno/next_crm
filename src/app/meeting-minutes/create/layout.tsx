// src/app/meeting-minutes/create/layout.tsx
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: '会議議事録作成 | CRM',
  description: '新しい会議議事録を作成します',
};

export default function CreateMeetingMinutesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
