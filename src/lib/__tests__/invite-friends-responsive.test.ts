import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("InviteFriendsCard 320px responsiveness and 1-row layout", () => {
  const filePath = join(process.cwd(), "src/components/InviteFriendsCard.tsx");
  const fileContent = readFileSync(filePath, "utf-8");

  it("ensures ShareActions renders the 3 share buttons in a 3-column single row", () => {
    expect(fileContent).toContain(
      'className="grid grid-cols-3 gap-1 min-[360px]:gap-2 pt-1 w-full"'
    );
  });

  it("ensures each button uses min-w-0 and truncate to prevent text overflow on 320px devices", () => {
    // Verify min-w-0 on actionBase button styles
    expect(fileContent).toContain("min-w-0 flex");

    // Verify truncate on labels
    expect(fileContent).toContain('className="truncate tracking-tight">WhatsApp<');
    expect(fileContent).toContain('className="truncate tracking-tight">Messenger<');
  });

  it("ensures compact card padding is scaled down for 320px screens", () => {
    expect(fileContent).toContain(
      'p-3 min-[360px]:p-4 sm:p-5'
    );
  });

  it("ensures WhatsApp and Messenger share links and icons are preserved", () => {
    expect(fileContent).toContain("https://api.whatsapp.com/send?text=");
    expect(fileContent).toContain("fb-messenger://share?link=");
    expect(fileContent).toContain("💬");
    expect(fileContent).toContain("⚡");
    expect(fileContent).toContain("📤");
  });
});
