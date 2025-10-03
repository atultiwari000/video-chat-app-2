// import MeetingRoom from "@/components/meeting-room"

// export default function MeetingPage({
//   params,
//   searchParams,
// }: {
//   params: { id: string }
//   searchParams: { username?: string }
// }) {
//   return <MeetingRoom meetingId={params.id} username={searchParams.username || "Guest"} />
// }
import MeetingRoom from "@/components/meeting-room";

export default function RoomPage({
  params,
  searchParams,
}: {
  params: { roomId: string };
  searchParams: { userName?: string };
}) {
  return <MeetingRoom />;
}
