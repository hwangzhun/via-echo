import { describe, expect, it } from "vitest";
import { resolveEncoder, resolveKey } from "./model";
import type { EncoderBinding, KeyBinding } from "./types";

const key = (rawCode: number, displayLabel: string): KeyBinding => ({
  rawCode,
  qmkName: displayLabel,
  displayLabel,
});

describe("transparent binding resolution", () => {
  it("falls through to the nearest lower keyboard layer", () => {
    const layers = Array.from({ length: 4 }, () => Array.from({ length: 20 }, () => key(0, "NO")));
    layers[0][6] = key(4, "A");
    layers[1][6] = key(1, "TRNS");
    layers[2][6] = key(5, "B");
    expect(resolveKey(layers, 1, 1, 1).displayLabel).toBe("A");
    expect(resolveKey(layers, 2, 1, 1).displayLabel).toBe("B");
  });

  it("resolves three encoder actions independently", () => {
    const base: EncoderBinding = {
      id: "e0",
      press: key(40, "Enter"),
      counterClockwise: key(172, "上一曲"),
      clockwise: key(171, "下一曲"),
    };
    const transparent: EncoderBinding = {
      id: "e0",
      press: key(1, "TRNS"),
      counterClockwise: key(1, "TRNS"),
      clockwise: key(169, "音量 +"),
    };
    const result = resolveEncoder([[base], [transparent]], 1, 0);
    expect(result.press.displayLabel).toBe("Enter");
    expect(result.counterClockwise.displayLabel).toBe("上一曲");
    expect(result.clockwise.displayLabel).toBe("音量 +");
  });
});
