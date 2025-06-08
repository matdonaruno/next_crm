export default function MeetingMinutesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* ページコンテンツ */}
      <main>{children}</main>
    </>
  );
}