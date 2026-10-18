import type { ReactNode } from "react";

interface ContainerProps {
  children: ReactNode;
  className?: string;
  size?: "narrow" | "default" | "wide";
}

export function Container({
  children,
  className = "",
  size = "default",
}: ContainerProps) {
  const maxWidthClass =
    size === "narrow"
      ? "max-w-xl"
      : size === "wide"
        ? "max-w-[1208px]"
        : "max-w-[1208px]";

  return (
    <div
      className={`mx-auto w-full ${maxWidthClass} px-3.5 min-[360px]:px-4 sm:px-6 lg:px-8 ${className}`.trim()}
    >
      {children}
    </div>
  );
}
