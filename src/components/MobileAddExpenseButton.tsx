"use client";

export function MobileAddExpenseButton({ label }: { label: string }) {
  return (
    <div className="fixed bottom-5 left-4 right-4 z-30 sm:hidden">
      <button
        type="button"
        onClick={() => {
          window.dispatchEvent(new CustomEvent("jump-to-add-expense"));
        }}
        className="flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-full bg-gradient-to-r from-[#18201a] via-[#1b2b20] to-[#0b724f] py-3.5 px-6 text-sm font-black text-white shadow-xl hover:shadow-2xl active:scale-[0.98] transition-all cursor-pointer"
      >
        <span className="text-base">➕</span>
        <span>{label}</span>
      </button>
    </div>
  );
}
