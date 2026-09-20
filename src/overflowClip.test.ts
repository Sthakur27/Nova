// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { overflowClip } from "./overflowClip";

afterEach(() => document.body.replaceChildren());

function box(element: HTMLElement, left: number, top: number, width: number, height: number, border = 0) {
  element.getBoundingClientRect = () => ({ left, top, right: left + width, bottom: top + height, width, height }) as DOMRect;
  Object.defineProperties(element, {
    clientLeft: { configurable: true, value: border },
    clientTop: { configurable: true, value: border },
    clientWidth: { configurable: true, value: width - border * 2 },
    clientHeight: { configurable: true, value: height - border * 2 },
  });
}

it("clips a partially shown tab at the strip boundary and follows resizing and scrolling", () => {
  const strip = document.createElement("div");
  const tab = document.createElement("button");
  document.body.append(strip);
  strip.append(tab);
  strip.style.overflowX = "auto";
  strip.style.overflowY = "hidden";
  box(strip, 100, 20, 300, 50);
  box(tab, 350, 20, 160, 50);
  expect(overflowClip(tab, 1000, 800)).toEqual({ left: 100, top: 20, right: 400, bottom: 70 });
  strip.scrollLeft = 200;
  box(tab, 150, 20, 160, 50);
  box(strip, 100, 20, 240, 50);
  expect(overflowClip(tab, 1000, 800)).toEqual({ left: 100, top: 20, right: 340, bottom: 70 });
});

it("intersects nested clipping axes using client boxes, excluding borders and scrollbars", () => {
  const outer = document.createElement("div");
  const inner = document.createElement("div");
  const target = document.createElement("button");
  document.body.append(outer);
  outer.append(inner);
  inner.append(target);
  outer.style.overflowX = "clip";
  inner.style.overflowY = "scroll";
  box(outer, 40, 0, 200, 300, 2);
  box(inner, 0, 60, 500, 100, 1);
  Object.defineProperty(inner, "clientHeight", { value: 88 });
  expect(overflowClip(target, 1000, 800)).toEqual({ left: 42, top: 61, right: 238, bottom: 149 });
});

it("leaves controls in non-clipping ancestors bounded only by the viewport", () => {
  const target = document.createElement("button");
  document.body.append(target);
  expect(overflowClip(target, 1000, 800)).toEqual({ left: 0, top: 0, right: 1000, bottom: 800 });
});
