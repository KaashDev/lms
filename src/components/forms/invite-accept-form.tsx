"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/primitives";

export function InviteAcceptForm({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function accept() {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/invites/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        setError("Couldn't accept this invite. It may have already been used or expired.");
        return;
      }
      const data = await res.json();
      router.push(`/classes/${data.classId}`);
    });
  }

  return (
    <div className="space-y-4">
      <Button onClick={accept} disabled={pending} className="w-full">
        {pending ? "Joining..." : "Accept and join"}
      </Button>
      {error ? (
        <div role="alert" className="text-danger text-sm">
          {error}
        </div>
      ) : null}
    </div>
  );
}
