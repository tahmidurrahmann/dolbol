import type { ExpenseCategoryValue, MemberInput } from "@/lib/money";

export interface EvalExpectedItem {
  lineIndex: number;
  amount: number | null;
  category?: ExpenseCategoryValue;
  isSettlement?: boolean;
  receiverMemberId?: string | null;
  hasQuestion?: boolean;
  needsAttention?: boolean;
}

export interface EvalCase {
  id: string;
  description: string;
  input: string;
  currentMemberId: string;
  expectedItems: EvalExpectedItem[];
}

export const EVAL_MEMBERS: MemberInput[] = [
  { id: "karim", displayName: "Karim", emoji: "🐅", isGuest: false },
  { id: "sumi", displayName: "Sumi", emoji: "🌴", isGuest: false },
  { id: "tanvir", displayName: "Tanvir", emoji: "🚤", isGuest: false },
  { id: "nabila", displayName: "Nabila", emoji: "📸", isGuest: false },
  { id: "mamun", displayName: "Mamun (Guest)", emoji: "👤", isGuest: true },
];

export const EVAL_CASES: EvalCase[] = [
  {
    id: "case-1-three-line-food",
    description: "the three-line example (three FOOD expenses: 1200, 200, 600)",
    input: "rater khabar 1200\nshokaler nasta 200\nDUPURER khabar 600",
    currentMemberId: "karim",
    expectedItems: [
      { lineIndex: 0, amount: 1200, category: "FOOD", isSettlement: false },
      { lineIndex: 1, amount: 200, category: "FOOD", isSettlement: false },
      { lineIndex: 2, amount: 600, category: "FOOD", isSettlement: false },
    ],
  },
  {
    id: "case-2-settlement-line",
    description: "three lines where line 2 is a settlement ('Sumi ke 500 dilam')",
    input: "rater khabar 1200\nSumi ke 500 dilam\nDUPURER khabar 600",
    currentMemberId: "karim",
    expectedItems: [
      { lineIndex: 0, amount: 1200, category: "FOOD", isSettlement: false },
      {
        lineIndex: 1,
        amount: 500,
        isSettlement: true,
        receiverMemberId: "sumi",
      },
      { lineIndex: 2, amount: 600, category: "FOOD", isSettlement: false },
    ],
  },
  {
    id: "case-3-missing-amount-tickets",
    description: "three lines where one line has no amount ('tickets') and must ask",
    input: "rater khabar 1200\ntickets\nDUPURER khabar 600",
    currentMemberId: "karim",
    expectedItems: [
      { lineIndex: 0, amount: 1200, category: "FOOD", isSettlement: false },
      {
        lineIndex: 1,
        amount: null,
        hasQuestion: true,
        needsAttention: true,
      },
      { lineIndex: 2, amount: 600, category: "FOOD", isSettlement: false },
    ],
  },
  {
    id: "case-4-ambiguous-quantity-ticket",
    description: "a line with 'ticket 2 ta 600' which must ask whether 600 is each or total",
    input: "ticket 2 ta 600",
    currentMemberId: "karim",
    expectedItems: [
      {
        lineIndex: 0,
        amount: 600,
        hasQuestion: true,
        needsAttention: true,
      },
    ],
  },
  {
    id: "case-5-unknown-person",
    description: "a line naming a person who is not in the trip, which must ask",
    input: "Babul ke 500 dilam",
    currentMemberId: "karim",
    expectedItems: [
      {
        lineIndex: 0,
        amount: 500,
        hasQuestion: true,
        needsAttention: true,
      },
    ],
  },
  {
    id: "case-6-mixed-bangla-and-banglish",
    description: "mixed Bangla script and Banglish lines",
    input: "রাতের খাবার ১২০০\nshokaler nasta 200\nদুপুরের খাবার ৬০০",
    currentMemberId: "karim",
    expectedItems: [
      { lineIndex: 0, amount: 1200, category: "FOOD", isSettlement: false },
      { lineIndex: 1, amount: 200, category: "FOOD", isSettlement: false },
      { lineIndex: 2, amount: 600, category: "FOOD", isSettlement: false },
    ],
  },
];
