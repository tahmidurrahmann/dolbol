import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "soft"
  | "outline"
  | "charcoal"
  | "solid";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: ButtonVariant;
  fullWidth?: boolean;
}

export function Button({
  children,
  variant = "primary",
  fullWidth = true,
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  const baseStyles =
    "inline-flex min-h-[46px] min-w-[44px] items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm sm:text-base font-bold transition-all motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f6b4a] active:scale-[0.98] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 select-none";

  const variantStyles: Record<ButtonVariant, string> = {
    // Soft mint pill button matching the screenshot (media_1792177474699_787950d8.png)
    primary:
      "bg-[#e8f5ee] border border-emerald-300/80 text-[#0f6b4a] hover:bg-[#daf0e3] hover:border-emerald-400 shadow-2xs",
    secondary:
      "border border-gray-300/90 bg-white text-gray-800 hover:bg-gray-50 shadow-2xs",
    soft:
      "bg-[#eaf4ee] border border-emerald-200/80 text-[#0f6b4a] hover:bg-[#d8efe2] shadow-2xs",
    outline:
      "border border-gray-700 bg-white text-gray-800 hover:bg-gray-50",
    charcoal:
      "bg-[#18201a] text-white hover:bg-[#253229] shadow-2xs",
    solid:
      "bg-[#0f6b4a] text-white hover:bg-[#0c593d] shadow-xs",
  };

  const widthStyle = fullWidth ? "w-full" : "";

  return (
    <button
      type={type}
      className={`${baseStyles} ${variantStyles[variant]} ${widthStyle} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}
