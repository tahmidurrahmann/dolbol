import { describe, expect, it } from "vitest";
import { parseExpenseTextWithAI } from "@/lib/ai-parser";
import { EVAL_CASES, EVAL_MEMBERS } from "./cases";

interface FieldMetric {
  total: number;
  correct: number;
}

type MetricKey =
  | "itemCount"
  | "amount"
  | "category"
  | "settlement"
  | "receiver"
  | "questionOrAttention";

describe("Expense Parser Eval Harness (RUNS = 3)", () => {
  const RUNS = 3;

  it("evaluates all benchmark cases across 3 runs and reports accuracy per field", async () => {
    const fieldMetrics: Record<MetricKey, FieldMetric> = {
      itemCount: { total: 0, correct: 0 },
      amount: { total: 0, correct: 0 },
      category: { total: 0, correct: 0 },
      settlement: { total: 0, correct: 0 },
      receiver: { total: 0, correct: 0 },
      questionOrAttention: { total: 0, correct: 0 },
    };

    const caseResults: Array<{
      id: string;
      description: string;
      runs: number;
      passedRuns: number;
    }> = [];

    for (const testCase of EVAL_CASES) {
      let passedRuns = 0;

      for (let run = 0; run < RUNS; run++) {
        const result = await parseExpenseTextWithAI({
          rawText: testCase.input,
          members: EVAL_MEMBERS,
          currentMemberId: testCase.currentMemberId,
        });

        let runPassed = true;

        // Check item count
        fieldMetrics.itemCount.total++;
        if (result.items.length === testCase.expectedItems.length) {
          fieldMetrics.itemCount.correct++;
        } else {
          runPassed = false;
        }

        for (let i = 0; i < testCase.expectedItems.length; i++) {
          const expected = testCase.expectedItems[i]!;
          const actual = result.items[i];

          if (!actual) {
            runPassed = false;
            continue;
          }

          // Amount field check
          fieldMetrics.amount.total++;
          if (actual.amount === expected.amount) {
            fieldMetrics.amount.correct++;
          } else {
            runPassed = false;
          }

          // Category check (if specified in expectations)
          if (expected.category) {
            fieldMetrics.category.total++;
            if (actual.category === expected.category) {
              fieldMetrics.category.correct++;
            } else {
              runPassed = false;
            }
          }

          // Settlement flag check
          if (expected.isSettlement !== undefined) {
            fieldMetrics.settlement.total++;
            if (actual.isSettlement === expected.isSettlement) {
              fieldMetrics.settlement.correct++;
            } else {
              runPassed = false;
            }
          }

          // Receiver check
          if (expected.receiverMemberId !== undefined) {
            fieldMetrics.receiver.total++;
            if (actual.receiverMemberId === expected.receiverMemberId) {
              fieldMetrics.receiver.correct++;
            } else {
              runPassed = false;
            }
          }

          // Question / Needs attention check
          if (expected.hasQuestion !== undefined) {
            fieldMetrics.questionOrAttention.total++;
            const hasQuestionMatches =
              Boolean(actual.question) === expected.hasQuestion;
            const needsAttentionMatches =
              expected.needsAttention === undefined ||
              actual.needsAttention === expected.needsAttention;

            if (hasQuestionMatches && needsAttentionMatches) {
              fieldMetrics.questionOrAttention.correct++;
            } else {
              runPassed = false;
            }
          }
        }

        if (runPassed) {
          passedRuns++;
        }
      }

      caseResults.push({
        id: testCase.id,
        description: testCase.description,
        runs: RUNS,
        passedRuns,
      });

      expect(passedRuns).toBe(RUNS);
    }

    // Print evaluation report
    console.log("\n=======================================================");
    console.log("       EXPENSE PARSER EVALUATION REPORT (RUNS=3)       ");
    console.log("=======================================================");
    console.log("\nBenchmark Cases Results:");
    console.table(
      caseResults.map((c) => ({
        Case: c.id,
        Passed: `${c.passedRuns}/${c.runs}`,
        Accuracy: `${Math.round((c.passedRuns / c.runs) * 100)}%`,
        Description: c.description,
      })),
    );

    console.log("\nField-Level Accuracy Summary:");
    console.table(
      Object.entries(fieldMetrics).map(([field, metric]) => ({
        Field: field,
        Evaluations: metric.total,
        Correct: metric.correct,
        Accuracy: `${Math.round((metric.correct / metric.total) * 100)}%`,
      })),
    );
    console.log("=======================================================\n");

    // Assert 100% field accuracy on core eval cases
    for (const [field, metric] of Object.entries(fieldMetrics)) {
      expect(
        metric.correct,
        `Field ${field} accuracy should be 100%`,
      ).toBe(metric.total);
    }
  });
});
