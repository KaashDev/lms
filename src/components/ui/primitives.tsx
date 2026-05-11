"use client";

import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className = "", ...props },
  ref
) {
  const v =
    variant === "primary"
      ? "btn-primary"
      : variant === "danger"
        ? "btn-danger"
        : variant === "ghost"
          ? "btn-ghost"
          : "btn-secondary";
  const s = size === "sm" ? "px-3 py-1.5 text-xs" : "";
  return <button ref={ref} className={`${v} ${s} ${className}`.trim()} {...props} />;
});

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = "", ...props }, ref) {
    return <input ref={ref} className={`input ${className}`.trim()} {...props} />;
  }
);

export function Label({
  htmlFor,
  children,
  required,
}: {
  htmlFor: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label htmlFor={htmlFor} className="label">
      {children}
      {required ? (
        <span aria-hidden="true" className="text-danger ml-0.5">
          *
        </span>
      ) : null}
    </label>
  );
}
