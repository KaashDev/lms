"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

interface SidebarProps {
  userName: string;
  userEmail: string;
  role: "TEACHER" | "TA" | "STUDENT";
}

export function Sidebar({ userName, userEmail, role }: SidebarProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const links: Array<{ href: string; label: string; show: boolean }> = [
    { href: "/dashboard", label: "Dashboard", show: true },
    { href: "/classes", label: "Classes", show: true },
    { href: "/trash", label: "Trash", show: role === "TEACHER" },
    { href: "/join", label: "Join a class", show: role === "STUDENT" },
  ];

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden flex items-center justify-between border-b border-border px-4 py-3 bg-surface">
        <Link href="/dashboard" className="font-display text-xl">
          LMS
        </Link>
        <button
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls="primary-nav"
          aria-label={open ? "Close navigation" : "Open navigation"}
          className="p-2 rounded hover:bg-surface-2"
        >
          <span aria-hidden="true">{open ? "✕" : "☰"}</span>
        </button>
      </div>

      <nav
        id="primary-nav"
        aria-label="Primary"
        className={`${open ? "block" : "hidden"} md:block md:w-60 md:flex-shrink-0 border-r border-border bg-surface md:min-h-screen`}
      >
        <div className="px-4 py-6 hidden md:block">
          <Link href="/dashboard" className="font-display text-2xl">
            LMS
          </Link>
        </div>

        <ul className="py-2 md:py-0">
          {links
            .filter((l) => l.show)
            .map((l) => {
              const active = pathname === l.href || pathname.startsWith(l.href + "/");
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className={`block px-4 py-2 text-sm transition-colors ${
                      active
                        ? "bg-surface-2 text-fg border-l-2 border-accent"
                        : "text-muted hover:bg-surface-2 hover:text-fg border-l-2 border-transparent"
                    }`}
                  >
                    {l.label}
                  </Link>
                </li>
              );
            })}
        </ul>

        <div className="border-t border-border mt-4 p-4 text-xs">
          <div className="font-medium text-fg truncate">{userName}</div>
          <div className="text-muted truncate" title={userEmail}>
            {userEmail}
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="mt-3 text-muted hover:text-danger"
          >
            Sign out
          </button>
        </div>
      </nav>
    </>
  );
}
