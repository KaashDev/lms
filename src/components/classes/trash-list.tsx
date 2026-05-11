"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/primitives";

interface Item {
  id: string;
  title: string;
  term: string | null;
  deletedAt: string;
  daysLeft: number;
}

export function TrashList({ items }: { items: Item[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function restore(id: string) {
    startTransition(async () => {
      const res = await fetch(`/api/classes/${id}`, { method: "PUT" });
      if (res.ok) router.refresh();
    });
  }

  if (items.length === 0) {
    return <p className="text-muted text-sm">No deleted classes.</p>;
  }

  return (
    <ul className="divide-y divide-border card">
      {items.map((i) => (
        <li key={i.id} className="flex items-center justify-between px-4 py-3">
          <div>
            <div className="text-fg">{i.title}</div>
            <div className="text-xs text-muted">
              {i.term ? `${i.term} · ` : ""}deleted {new Date(i.deletedAt).toLocaleDateString()}
              {" · "}
              <span className={i.daysLeft <= 7 ? "text-warning" : ""}>
                {i.daysLeft} day{i.daysLeft === 1 ? "" : "s"} until permanent removal
              </span>
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={() => restore(i.id)} disabled={pending}>
            Restore
          </Button>
        </li>
      ))}
    </ul>
  );
}
