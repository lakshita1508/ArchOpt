// Frontend unit tests for the pure helper libraries. Run from the repo root:  node --test tests/frontend/
// (Node 22+ strips TypeScript types natively, so no extra tooling is needed.)
import test from "node:test";
import assert from "node:assert/strict";
import { intersectionArea, overlaps, outsideArea, sharedWall, adjacentRooms, geometryIssues, snap, clamp, differingRooms } from "../../frontend/lib/geometry.ts";
import { len, area, num, pct } from "../../frontend/lib/format.ts";

const R = (name, x, y, width, height, extra = {}) => ({ name, x, y, width, height, ...extra });

test("rectangle overlap: touching edges are not overlap", () => {
  assert.equal(overlaps(R("a", 0, 0, 4, 4), R("b", 4, 0, 4, 4)), false);
  assert.equal(overlaps(R("a", 0, 0, 4, 4), R("b", 2, 2, 4, 4)), true);
  assert.equal(intersectionArea(R("a", 0, 0, 4, 4), R("b", 2, 2, 4, 4)), 4);
});

test("boundary check", () => {
  assert.equal(outsideArea(R("a", 0, 0, 4, 4), 10, 10), 0);
  assert.equal(outsideArea(R("a", 8, 8, 4, 4), 10, 10), 12);
});

test("shared wall + adjacency", () => {
  assert.equal(sharedWall(R("a", 0, 0, 4, 4), R("b", 4, 1, 4, 2)), 2);
  assert.equal(sharedWall(R("a", 0, 0, 4, 4), R("b", 4, 4, 2, 2)), 0); // corner only
  const rooms = [R("a", 0, 0, 4, 4), R("b", 4, 0, 4, 4), R("c", 20, 20, 2, 2), R("free", 0, 4, 4, 4, { isFree: true })];
  assert.deepEqual(adjacentRooms(rooms, "a"), ["b"]); // free space is never "adjacent"
});

test("geometryIssues flags overlaps and boundary violations", () => {
  const issues = geometryIssues([R("a", 0, 0, 6, 6), R("b", 4, 4, 6, 6), R("c", 8, 8, 6, 6)], 10, 10);
  assert.ok(issues.a.some((m) => m.includes("Overlaps b")));
  assert.ok(issues.c.some((m) => m.includes("Outside plot")));
  assert.deepEqual(geometryIssues([R("a", 0, 0, 5, 5), R("b", 5, 0, 5, 5)], 10, 10), {});
});

test("snap / clamp / differingRooms", () => {
  assert.equal(snap(3.26, 0.5), 3.5);
  assert.equal(snap(3.26, 0), 3.26);
  assert.equal(clamp(9, 0, 5), 5);
  const ref = [R("a", 0, 0, 4, 4), R("b", 4, 0, 4, 4)];
  const other = [R("a", 0, 0, 4, 4), R("b", 4, 0, 5, 4)];
  assert.deepEqual([...differingRooms(ref, other)], ["b"]);
});

test("formatting and unit conversion", () => {
  assert.equal(len(10), "10 m");
  assert.equal(len(10, "imperial"), "32.8 ft");
  assert.equal(area(100), "100 m²");
  assert.equal(area(10, "imperial"), "108 ft²");
  assert.equal(num(null), "–");
  assert.equal(num(2.3456, 2), "2.35");
  assert.equal(pct(95.56), "95.6%");
});
