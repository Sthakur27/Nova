import { expect, it } from "vitest";
import { recentMenuPosition } from "./recentMenuPosition";

it("keeps menus within the viewport near either edge", () => {
  expect(recentMenuPosition({ right: 170, top: 520, bottom: 544 }, 320, 240, 800, 600)).toEqual({ left: 8, top: 274 });
  expect(recentMenuPosition({ right: 900, top: 10, bottom: 34 }, 320, 240, 800, 600)).toEqual({ left: 472, top: 40 });
  expect(recentMenuPosition({ right: 170, top: 10, bottom: 34 }, 304, 240, 320, 256)).toEqual({ left: 8, top: 8 });
});
