import { Suspense } from "react";
import { TopBar } from "@/components/shell/topbar";
import { MessagesPage } from "@/features/messages/messages-page";

export default function Page() {
  return (
    <>
      <TopBar titleKey="messages" />
      <main className="flex min-h-0 flex-1 flex-col">
        <Suspense>
          <MessagesPage />
        </Suspense>
      </main>
    </>
  );
}
