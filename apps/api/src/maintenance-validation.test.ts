import assert from "node:assert/strict";
import test from "node:test";
import { validateMaintenanceInput } from "./maintenance-validation.js";

test("trims valid maintenance request fields and defaults priority", () => {
  assert.deepEqual(validateMaintenanceInput({
    title: "  Leaking tap  ",
    description: "  Water is leaking under the kitchen sink.  ",
  }), {
    ok: true,
    value: {
      title: "Leaking tap",
      description: "Water is leaking under the kitchen sink.",
      priority: "normal",
      unitId: null,
    },
  });
});

test("accepts all supported priorities and trims optional unit id", () => {
  for (const priority of ["low", "normal", "high", "urgent"] as const) {
    const result = validateMaintenanceInput({
      title: "Repair gate",
      description: "The main gate will not close.",
      priority,
      unitId: " unit-123 ",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.priority, priority);
      assert.equal(result.value.unitId, "unit-123");
    }
  }
});

test("rejects missing, too-short, and oversized request fields", () => {
  assert.deepEqual(validateMaintenanceInput(null), {
    ok: false,
    error: "invalid_maintenance_request",
  });
  assert.deepEqual(validateMaintenanceInput({
    title: "ok",
    description: "Enough description",
  }), {
    ok: false,
    error: "invalid_maintenance_request",
  });
  assert.deepEqual(validateMaintenanceInput({
    title: "x".repeat(121),
    description: "Enough description",
  }), {
    ok: false,
    error: "invalid_maintenance_request",
  });
  assert.deepEqual(validateMaintenanceInput({
    title: "Valid title",
    description: "x".repeat(3001),
  }), {
    ok: false,
    error: "invalid_maintenance_request",
  });
});

test("rejects unsupported maintenance priority", () => {
  assert.deepEqual(validateMaintenanceInput({
    title: "Repair gate",
    description: "The main gate will not close.",
    priority: "critical",
  }), {
    ok: false,
    error: "invalid_maintenance_priority",
  });
});
