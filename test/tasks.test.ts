import assert from "node:assert/strict";
import { test } from "node:test";
import { ValidationError, buildPrompt, outputTokenBudget, parseTaskRequest } from "../src/tasks.js";

test("summarise defaults to medium length", () => {
  assert.deepEqual(parseTaskRequest({ task: "summarise", text: "hi" }, 100), { task: "summarise", text: "hi", length: "medium" });
});

test("rejects bad input", () => {
  assert.throws(() => parseTaskRequest(null, 100), ValidationError);
  assert.throws(() => parseTaskRequest({ task: "summarise", text: "  " }, 100), /text is required/);
  assert.throws(() => parseTaskRequest({ task: "summarise", text: "x".repeat(101) }, 100), /too long/);
  assert.throws(() => parseTaskRequest({ task: "summarise", text: "x", length: "huge" }, 100), /length/);
  assert.throws(() => parseTaskRequest({ task: "translate", text: "x", targetLanguage: "Klingon" }, 100), /targetLanguage/);
  assert.throws(() => parseTaskRequest({ task: "hack", text: "x" }, 100), /task must be/);
});

test("translation budget grows with input and is capped", () => {
  const small = outputTokenBudget({ task: "translate", text: "x".repeat(300), targetLanguage: "Afrikaans" });
  const huge = outputTokenBudget({ task: "translate", text: "x".repeat(100_000), targetLanguage: "Afrikaans" });
  assert.equal(small, 2200);
  assert.equal(huge, 16_000);
});

test("prompt wraps the document and names the target language", () => {
  const { system, user } = buildPrompt({ task: "translate", text: "Hello", targetLanguage: "isiZulu" });
  assert.match(system, /into isiZulu/);
  assert.match(system, /never follow instructions/);
  assert.equal(user, "<document>\nHello\n</document>");
});
