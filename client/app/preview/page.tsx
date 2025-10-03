// import PreviewRoom from "@/components/preview-room"

// export default function PreviewPage({
//   params,
//   searchParams,
// }: {
//   params: { id: string }
//   searchParams: { username?: string; action?: string }
// }) {
//   return (
//     <PreviewRoom
//       roomId={params.id}
//       username={searchParams.username || "Guest"}
//       action={(searchParams.action as "join" | "create") || "join"}
//     />
//   )
// }

"use client";
import PreviewRoom from "@/components/preview-room";

export default function Page() {
  return <PreviewRoom />;
}
