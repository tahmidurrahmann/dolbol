import { describe, expect, it } from "vitest";
import {
  computeExpenseShares,
  computeMemberBalances,
  type ExpenseRecordInput,
  type MemberInput,
  simplifyDebts,
} from "@/lib/money";

describe("Expense Explainer Demo Math Verification", () => {
  it("proves the demo numbers: Karim paid 1200+200+600=2000, 4 equal shares = 500 each, Sumi owes Karim ৳500", () => {
    // 4 Demo members: করিম, সুমি, তানভীর, নাবিলা
    const members: MemberInput[] = [
      { id: "karim", displayName: "করিম", emoji: "🎒" },
      { id: "sumi", displayName: "সুমি", emoji: "🎒" },
      { id: "tanvir", displayName: "তানভীর", emoji: "🎒" },
      { id: "nabila", displayName: "নাবিলা", emoji: "🎒" },
    ];
    const memberIds = members.map((m) => m.id);

    // Three expenses paid by Karim:
    // 1. রাতের খাবার 1200
    // 2. সকালের নাস্তা 200
    // 3. দুপুরের খাবার 600
    const exp1Shares = computeExpenseShares({
      amount: 1200,
      paidById: "karim",
      splitType: "EQUAL",
      participantIds: memberIds,
    });
    expect(exp1Shares).toEqual([
      { memberId: "karim", amount: 300 },
      { memberId: "sumi", amount: 300 },
      { memberId: "tanvir", amount: 300 },
      { memberId: "nabila", amount: 300 },
    ]);

    const exp2Shares = computeExpenseShares({
      amount: 200,
      paidById: "karim",
      splitType: "EQUAL",
      participantIds: memberIds,
    });
    expect(exp2Shares).toEqual([
      { memberId: "karim", amount: 50 },
      { memberId: "sumi", amount: 50 },
      { memberId: "tanvir", amount: 50 },
      { memberId: "nabila", amount: 50 },
    ]);

    const exp3Shares = computeExpenseShares({
      amount: 600,
      paidById: "karim",
      splitType: "EQUAL",
      participantIds: memberIds,
    });
    expect(exp3Shares).toEqual([
      { memberId: "karim", amount: 150 },
      { memberId: "sumi", amount: 150 },
      { memberId: "tanvir", amount: 150 },
      { memberId: "nabila", amount: 150 },
    ]);

    // Total spent
    const totalSpent = 1200 + 200 + 600;
    expect(totalSpent).toBe(2000);

    // Each participant's share across the three expenses
    const sumiTotalShare = 300 + 50 + 150;
    expect(sumiTotalShare).toBe(500);

    const expenses: ExpenseRecordInput[] = [
      {
        id: "exp-1",
        title: "রাতের খাবার",
        amount: 1200,
        category: "FOOD",
        expenseDate: new Date("2026-10-17T12:00:00Z"),
        paidById: "karim",
        createdById: "karim",
        splitType: "EQUAL",
        note: null,
        deletedAt: null,
        createdAt: new Date("2026-10-17T12:00:00Z"),
        updatedAt: new Date("2026-10-17T12:00:00Z"),
        shares: exp1Shares,
      },
      {
        id: "exp-2",
        title: "সকালের নাস্তা",
        amount: 200,
        category: "FOOD",
        expenseDate: new Date("2026-10-17T12:00:00Z"),
        paidById: "karim",
        createdById: "karim",
        splitType: "EQUAL",
        note: null,
        deletedAt: null,
        createdAt: new Date("2026-10-17T12:00:00Z"),
        updatedAt: new Date("2026-10-17T12:00:00Z"),
        shares: exp2Shares,
      },
      {
        id: "exp-3",
        title: "দুপুরের খাবার",
        amount: 600,
        category: "FOOD",
        expenseDate: new Date("2026-10-17T12:00:00Z"),
        paidById: "karim",
        createdById: "karim",
        splitType: "EQUAL",
        note: null,
        deletedAt: null,
        createdAt: new Date("2026-10-17T12:00:00Z"),
        updatedAt: new Date("2026-10-17T12:00:00Z"),
        shares: exp3Shares,
      },
    ];

    // Compute member balances
    const balances = computeMemberBalances({
      members,
      expenses,
      settlements: [],
    });

    const karimBal = balances.find((b) => b.memberId === "karim")!;
    const sumiBal = balances.find((b) => b.memberId === "sumi")!;
    const tanvirBal = balances.find((b) => b.memberId === "tanvir")!;
    const nabilaBal = balances.find((b) => b.memberId === "nabila")!;

    expect(karimBal.totalPaid).toBe(2000);
    expect(karimBal.totalOwed).toBe(500);
    expect(karimBal.netBalance).toBe(1500);

    expect(sumiBal.totalPaid).toBe(0);
    expect(sumiBal.totalOwed).toBe(500);
    expect(sumiBal.netBalance).toBe(-500);

    expect(tanvirBal.netBalance).toBe(-500);
    expect(nabilaBal.netBalance).toBe(-500);

    // Simplify debts into direct transfers
    const debts = simplifyDebts(balances);
    expect(debts).toEqual([
      { fromMemberId: "nabila", toMemberId: "karim", amount: 500 },
      { fromMemberId: "sumi", toMemberId: "karim", amount: 500 },
      { fromMemberId: "tanvir", toMemberId: "karim", amount: 500 },
    ]);

    // Proves that Sumi specifically owes Karim exactly ৳500
    const sumiToKarimDebt = debts.find(
      (d) => d.fromMemberId === "sumi" && d.toMemberId === "karim",
    );
    expect(sumiToKarimDebt).toBeDefined();
    expect(sumiToKarimDebt?.amount).toBe(500);
  });
});
