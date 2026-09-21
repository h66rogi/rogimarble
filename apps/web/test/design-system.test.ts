import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import {
  inspectSource,
  inspectProject,
  inspectTheme,
  inspectInherited,
} from "../scripts/check-design-system.ts";

const feature = "src/domains/marble/components/example.tsx";
const errors = (source: string, file = feature) =>
  inspectSource(file, source).map((item) => item.message);

test("new console UI obeys Shadcn and inherited console files retain their reviewed design", () => {
  const { violations } = inspectProject();
  assert.deepEqual(violations, []);
});
test("inherited UI is an exact baseline, not permission for new native controls", () => {
  const source = '<button className="relative px-3 py-3">홈</button>';
  const hash = createHash("sha256").update(source).digest("hex");
  assert.deepEqual(inspectInherited("original.tsx", source, hash), []);
  assert.ok(
    inspectInherited("original.tsx", source.replace("px-3", "px-8"), hash)
      ?.length,
  );
  assert.equal(inspectInherited(feature, source), null);
  assert.ok(errors(source).length);
});
test("only the root layout may apply the configured next/font generated variable class", () => {
  const source =
    'import { nanumSquareNeo as font } from "./fonts"; const view=<html className={font.variable} />';
  assert.deepEqual(errors(source, "app/layout.tsx"), []);
  assert.ok(errors(source).length);
  assert.ok(
    errors(source.replace("./fonts", "./arbitrary"), "app/layout.tsx").length,
  );
  assert.ok(
    errors(source.replace("font.variable", "font.className"), "app/layout.tsx")
      .length,
  );
});
test("broadcast font variables can be registered together without allowing arbitrary root styling", () => {
  const source = 'import { nanumSquareNeo, jua, doHyeon, blackHanSans } from "./fonts"; const view=<html className={`${nanumSquareNeo.variable} ${jua.variable} ${doHyeon.variable} ${blackHanSans.variable}`} />';
  assert.deepEqual(errors(source, "app/layout.tsx"), []);
  assert.ok(errors(source.replace('${jua.variable}', 'bg-pink-500'), "app/layout.tsx").length);
  assert.ok(errors(source.replace('${jua.variable}', '${other.variable}'), "app/layout.tsx").length);
});
test("rejects native controls, custom clickable surfaces and opaque spreads", () => {
  for (const source of [
    "<button />",
    '<input type="checkbox" />',
    "<select />",
    "<textarea />",
    "<label />",
    "<details />",
    "<div onClick={act} />",
    "<Button {...props} />",
  ])
    assert.ok(errors(source).length, source);
});
test("recognizes aliased primitives and rejects visual overrides in composed classes", () => {
  assert.ok(
    errors(
      'import { Button as Action } from "@/shared/components/ui/button"; const classes="bg-pink-500 h-7"; const view=<Action className={cn("w-full",classes)} />',
    ).length >= 2,
  );
  assert.ok(
    errors('<Button className={active ? "font-bold" : "text-xs"} />').length >=
      2,
  );
  assert.ok(errors("<Button className={styles.button} />").length);
});
test("rejects hard-coded colors, arbitrary styling, descendant overrides and custom cards", () => {
  for (const source of [
    '<div className="dark:bg-pink-950" />',
    '<div className="bg-[#fff]" />',
    '<div className="text-[10px]" />',
    '<div className="[&_button]:bg-primary" />',
    '<div className="rounded-lg border p-3" />',
    '<div style={{ color: "red" }} />',
  ])
    assert.ok(errors(source).length, source);
});
test("rejects alternate UI libraries and feature stylesheets", () => {
  assert.ok(errors('import { Root } from "@radix-ui/react-tabs";').length);
  assert.ok(errors('import "./page.css";').length);
});
test("allows semantic text, layout and approved variant composition", () => {
  assert.deepEqual(
    errors(
      '<section className="grid gap-4 bg-background text-foreground"><Button variant="outline" size="sm" className="w-full" /><p className="text-sm text-muted-foreground">정보</p></section>',
    ),
    [],
  );
});
test("board rendering is an exact path and property exception, never a console theme escape", () => {
  const renderer =
    "src/domains/marble/components/configuration/board-preview.tsx";
  assert.deepEqual(
    errors("<div style={{ left: x, backgroundColor: cell.fill }} />", renderer),
    [],
  );
  assert.ok(errors("<div style={{ left: x }} />").length);
  assert.ok(
    errors('<div style={{ "--primary": cell.fill }} />', renderer).length,
  );
  assert.ok(errors("<div style={arbitrary} />", renderer).length);
  assert.ok(errors("<input />", renderer).length);
});

test("feature selectors cannot be hidden in the global theme", () => {
  assert.equal(
    inspectTheme(":root { --primary: black; } .dark { --primary: white; }")
      .length,
    0,
  );
  assert.ok(
    inspectTheme(".marble-operator-controls button { color: pink; }").length,
  );
});
