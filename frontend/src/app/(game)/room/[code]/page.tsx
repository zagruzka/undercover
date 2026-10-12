import { Suspense } from "react";
import { PageLoading } from "@/components/game/page-loading";
import { RoomScreen } from "@/components/game/room-screen";
import { requireUser } from "@/lib/session";

export default function RoomPage(props: PageProps<"/room/[code]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Room params={props.params} />
    </Suspense>
  );
}

async function Room(props: Pick<PageProps<"/room/[code]">, "params">) {
  const { code } = await props.params;
  const roomId = code.toUpperCase();
  await requireUser(`/room/${roomId}`);
  return <RoomScreen roomId={roomId} />;
}
