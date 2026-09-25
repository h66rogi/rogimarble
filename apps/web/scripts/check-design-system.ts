import ts from "typescript";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const inherited = JSON.parse(
  readFileSync(resolve(root, "scripts/console-legacy-baseline.json"), "utf8"),
).files as Record<string, string>;
const nativeControls = new Set([
  "button",
  "input",
  "select",
  "textarea",
  "label",
  "details",
  "summary",
  "table",
  "style",
]);
const styledComponents = new Set([
  "Button",
  "Input",
  "Textarea",
  "Checkbox",
  "Switch",
  "SelectTrigger",
  "SelectContent",
  "SelectItem",
  "TabsList",
  "TabsTrigger",
  "Badge",
  "Alert",
  "Card",
  "CardTitle",
  "CardDescription",
  "Label",
  "SelectionButton",
  "BoardCellButton",
  "Avatar",
]);
const palette =
  /(?:^|:)(?:bg|text|border|ring|outline|fill|stroke|from|via|to|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-|\/|$)/;
const arbitraryPaint =
  /(?:^|:)(?:bg|text|border|ring|outline|fill|stroke|from|via|to|shadow|rounded)-\[/;
const controlVisual =
  /(?:^|:)(?:h-|min-h-|max-h-|size-|p[xytrblse]?-|text-|font-|leading-|tracking-|rounded|border|bg-|shadow|ring-|outline-|opacity-|transition|animate-|hover:)/;
export type Violation = { file: string; line: number; message: string };

/** Existing imported UI is preserved, never treated as a template for new exceptions. */
export function inspectInherited(
  file: string,
  source: string,
  hash?: string,
): Violation[] | null {
  if (!hash) return null;
  return createHash("sha256").update(source).digest("hex") === hash
    ? []
    : [
        {
          file,
          line: 1,
          message:
            "Inherited console frame changed. Review its preserved design and baseline; do not automatically convert it to Shadcn.",
        },
      ];
}

export function inspectSource(file: string, source: string): Violation[] {
  const result: Violation[] = [];
  const tree = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const primitive = file.startsWith("src/shared/components/ui/");
  const composition = file.startsWith("src/shared/components/common/");
  const renderer =
    file === "src/domains/marble/components/configuration/board-preview.tsx";
  const canonical = new Map<string, string>();
  const localFontBindings = new Set<string>();
  const values = new Map<string, ts.Expression>();
  const report = (node: ts.Node, message: string) =>
    result.push({
      file,
      line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1,
      message,
    });
  function index(node: ts.Node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer
    )
      values.set(node.name.text, node.initializer);
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const module = node.moduleSpecifier.text;
      const bindings = node.importClause?.namedBindings;
      if (
        file === "app/layout.tsx" &&
        module === "./fonts" &&
        bindings &&
        ts.isNamedImports(bindings)
      ) {
        for (const item of bindings.elements) {
          if (["nanumSquareNeo", "jua", "doHyeon", "blackHanSans"].includes(item.propertyName?.text ?? item.name.text))
            localFontBindings.add(item.name.text);
        }
      }
      if (bindings && ts.isNamedImports(bindings))
        for (const item of bindings.elements)
          canonical.set(
            item.name.text,
            item.propertyName?.text ?? item.name.text,
          );
      if (
        !primitive &&
        /^(?:@radix-ui\/|radix-ui$|@base-ui\/|@mui\/|antd$|class-variance-authority$)/.test(
          module,
        )
      )
        report(
          node,
          "Import UI behavior from shared/components/ui, not a second primitive library.",
        );
      if (
        /\.css$/.test(module) &&
        !(
          file === "app/layout.tsx" &&
          ["../src/app/globals.css", "./board-surface.css", "./broadcast-panels.css"].includes(module)
        )
      )
        report(
          node,
          "Feature CSS is forbidden; use shared components and the central theme.",
        );
    }
    ts.forEachChild(node, index);
  }
  index(tree);
  function strings(node: ts.Node, seen = new Set<string>()): string[] {
    if (ts.isStringLiteralLike(node)) return [node.text];
    if (ts.isIdentifier(node)) {
      if (node.text === "undefined") return [];
      if (seen.has(node.text)) return [];
      const value = values.get(node.text);
      if (value) return strings(value, new Set([...seen, node.text]));
      report(node, "Opaque className values are forbidden outside shared UI.");
      return [];
    }
    if (ts.isConditionalExpression(node))
      return [
        ...strings(node.whenTrue, seen),
        ...strings(node.whenFalse, seen),
      ];
    if (ts.isBinaryExpression(node)) return strings(node.right, seen);
    if (ts.isTemplateExpression(node))
      return [
        node.head.text,
        ...node.templateSpans.flatMap((span) => [
          ...strings(span.expression, seen),
          span.literal.text,
        ]),
      ];
    if (ts.isCallExpression(node) && node.expression.getText(tree) !== "cn")
      report(node, "Only the shared cn helper may compose className.");
    if (
      ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node)
    ) {
      report(node, "Dynamic style lookup belongs in shared UI.");
      return [];
    }
    const found: string[] = [];
    ts.forEachChild(node, (child) => {
      found.push(...strings(child, seen));
    });
    return found;
  }
  function visit(node: ts.Node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(tree),
        name = canonical.get(tag) ?? tag;
      if (!primitive && nativeControls.has(tag))
        report(node, `Native <${tag}> is forbidden; use its Shadcn component.`);
      for (const prop of node.attributes.properties) {
        if (ts.isJsxSpreadAttribute(prop)) {
          if (
            !primitive &&
            !composition &&
            (/^[a-z]/.test(tag) || styledComponents.has(name))
          )
            report(prop, "Opaque JSX spreads can bypass the design contract.");
          continue;
        }
        const attr = prop.name.getText(tree);
        if (attr === "dangerouslySetInnerHTML")
          report(prop, "Injected markup bypasses the design system.");
        if (attr === "style" && !primitive) {
          if (!renderer)
            report(
              prop,
              "Inline styles are reserved for the isolated board data renderer.",
            );
          else {
            let expression =
              prop.initializer && ts.isJsxExpression(prop.initializer)
                ? prop.initializer.expression
                : undefined;
            if (expression && ts.isIdentifier(expression))
              expression = values.get(expression.text);
            while (
              expression &&
              (ts.isAsExpression(expression) ||
                ts.isParenthesizedExpression(expression))
            )
              expression = expression.expression;
            const allowed = new Set([
              "left",
              "top",
              "width",
              "height",
              "aspectRatio",
              "backgroundColor",
              "color",
              "borderColor",
              "gridTemplateColumns",
              "gridTemplateRows",
              "gridColumn",
              "gridRow",
              "transform",
              "backgroundImage",
              "backgroundSize",
              "backgroundPosition",
              "zIndex",
              "--cell-fill",
              "--cell-border",
            ]);
            if (!expression || !ts.isObjectLiteralExpression(expression))
              report(
                prop,
                "Renderer style must be an explicit data geometry/color object.",
              );
            else
              for (const entry of expression.properties)
                if (
                  !ts.isPropertyAssignment(entry) ||
                  !allowed.has(entry.name.getText(tree).replace(/['"]/g, ""))
                )
                  report(
                    entry,
                    "This renderer style property is not approved.",
                  );
          }
        }
        if (attr === "className" && prop.initializer) {
          const expression = ts.isJsxExpression(prop.initializer)
            ? prop.initializer.expression
            : undefined;
          // Only next/font variable registrations are allowed on the root element.
          const fontVariable = (value: ts.Expression): boolean =>
            ts.isPropertyAccessExpression(value) && value.name.text === "variable" &&
            ts.isIdentifier(value.expression) && localFontBindings.has(value.expression.text);
          const generatedFontClass = file === "app/layout.tsx" && tag === "html" && expression &&
            (fontVariable(expression) || (ts.isTemplateExpression(expression) && expression.head.text.trim() === "" &&
              expression.templateSpans.every(span => fontVariable(span.expression) && span.literal.text.trim() === "")));
          // Shared components own variants. Features may only place those components.
          const chunks =
            primitive || composition || generatedFontClass
              ? []
              : strings(prop.initializer);
          for (const token of chunks
            .flatMap((chunk) => chunk.split(/\s+/))
            .filter(Boolean)) {
            if (
              palette.test(token) ||
              arbitraryPaint.test(token) ||
              /#[\da-f]{3,8}/i.test(token)
            )
              report(prop, `Use semantic theme tokens, not ${token}.`);
            if (
              token.includes("!") ||
              token.includes("[&") ||
              token.startsWith("[")
            )
              report(
                prop,
                `Selector/important overrides are forbidden: ${token}.`,
              );
            if (styledComponents.has(name) && controlVisual.test(token))
              report(prop, `Use the ${name} variant/size API, not ${token}.`);
            if (/^[a-z]/.test(tag) && /(?:^|:)rounded/.test(token) && !renderer)
              report(
                prop,
                "Use Card/Alert/Badge instead of a hand-styled surface.",
              );
            if (
              /^(?:studio-|console-shell|marble-operator-controls|login-shell)/.test(
                token,
              )
            )
              report(prop, `Legacy feature styling is forbidden: ${token}.`);
          }
        }
        if (
          !primitive &&
          /^[a-z]/.test(tag) &&
          ["onClick", "onPointerDown"].includes(attr) &&
          !(renderer && tag === "g")
        )
          report(
            prop,
            "Interactive controls must use a shared accessible primitive.",
          );
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return result;
}

function walk(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? walk(resolve(directory, entry.name))
      : [resolve(directory, entry.name)],
  );
}
function resolveImport(from: string, name: string): string | undefined {
  if (!name.startsWith(".") && !name.startsWith("@/")) return;
  const candidate = name.startsWith("@/")
    ? resolve(root, "src", name.slice(2))
    : resolve(dirname(from), name);
  return [
    candidate,
    `${candidate}.tsx`,
    `${candidate}.ts`,
    resolve(candidate, "index.tsx"),
    resolve(candidate, "index.ts"),
  ].find((path) => existsSync(path) && /\.(tsx?|css)$/.test(path));
}
export function inspectProject(): { files: string[]; violations: Violation[] } {
  // All current/future console routes and all feature components are roots; imports
  // recursively add shared and external-to-feature components. OBS is a separate product surface.
  const pending = [
    ...walk(resolve(root, "app")).filter(
      (file) =>
        file.endsWith(".tsx") &&
        !relative(root, file).startsWith("app/overlay/"),
    ),
    ...walk(resolve(root, "src/domains/marble")).filter((file) =>
      file.endsWith(".tsx"),
    ),
  ];
  const files = new Set<string>(),
    violations: Violation[] = [];
  while (pending.length) {
    const file = pending.pop()!;
    if (files.has(file) || extname(file) === ".css") continue;
    files.add(file);
    const source = readFileSync(file, "utf8");
    const name = relative(root, file).replaceAll("\\", "/");
    violations.push(
      ...(inspectInherited(name, source, inherited[name]) ??
        inspectSource(name, source)),
    );
    const tree = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
    );
    function imports(node: ts.Node) {
      let name: string | undefined;
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      )
        name = node.moduleSpecifier.text;
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])
      )
        name = node.arguments[0].text;
      if (name) {
        const target = resolveImport(file, name);
        if (target) pending.push(target);
      }
      ts.forEachChild(node, imports);
    }
    imports(tree);
  }
  // The board stylesheet is loaded beside the console but may only paint the board.
  const boardCss = readFileSync(
    resolve(root, "app/board-surface.css"),
    "utf8",
  ).replace(/\/\*[\s\S]*?\*\//g, "");
  for (const match of boardCss.matchAll(/([^{}]+)\{/g)) {
    const selector = match[1].trim();
    if (
      selector.startsWith("@media") ||
      selector.startsWith("@keyframes marble-") ||
      /^(?:from|to|\d{1,3}%)$/.test(selector)
    )
      continue;
    if (
      !selector
        .split(",")
        .every(
          (part) =>
            /^\.marble-board(?:\b|[ .:#])/.test(part.trim()) ||
            /^\.broadcast-hud-(?:card|eyebrow|value)(?:[ .:#]|$)/.test(
              part.trim(),
            ) ||
            /^(html|body):has\(\[data-total-overlay-source\]\)$/.test(
              part.trim(),
            ),
        )
    )
      violations.push({
        file: "app/board-surface.css",
        line: 1,
        message: `Board CSS escapes its renderer: ${selector}`,
      });
    if (/--(?:primary|accent|ring|background|foreground)\s*:/.test(boardCss)) {
      violations.push({
        file: "app/board-surface.css",
        line: 1,
        message: "Board CSS must not redefine console theme tokens.",
      });
      break;
    }
  }
  // Broadcast panels and the transparent OBS chat surface share no selectors or tokens with console chrome.
  const panelCss = readFileSync(resolve(root, "app/broadcast-panels.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const match of panelCss.matchAll(/([^{}]+)\{/g)) {
    const selector = match[1].trim();
    if (/^(?:@media |@keyframes rogimarble-chat-in$|from$|to$)/.test(selector)) continue;
    if (!selector.split(",").every(part => /^(?:\.broadcast-panel(?:\b|__|--)|\.rogimarble-chatbox(?:\b|__|\[))/.test(part.trim())))
      violations.push({file:"app/broadcast-panels.css",line:1,message:`Panel CSS escapes its renderer: ${match[1].trim()}`});
  }
  if (/--(?:primary|accent|ring|background|foreground)\s*:/.test(panelCss))
    violations.push({file:"app/broadcast-panels.css",line:1,message:"Panel CSS must not redefine console tokens."});
  // Only paths already present in the reviewed source-import manifest can be inherited.
  const importedPaths = new Set<string>(
    JSON.parse(
      readFileSync(
        resolve(root, "../../docs/source-imports/song-request-console.json"),
        "utf8",
      ),
    ).files.map((file: { targetPath: string }) =>
      file.targetPath.replace(/^apps\/web\//, ""),
    ),
  );
  for (const [name, hash] of Object.entries(inherited)) {
    if (!importedPaths.has(name) || name.startsWith("src/domains/marble/")) {
      violations.push({
        file: name,
        line: 1,
        message:
          "New product UI cannot be added to the inherited console baseline.",
      });
      continue;
    }
    const path = resolve(root, name);
    if (!existsSync(path)) {
      violations.push({
        file: name,
        line: 1,
        message: "Preserved imported console file is missing.",
      });
      continue;
    }
    // Also verify inherited CSS and files outside the current dependency closure.
    if (!files.has(path))
      violations.push(
        ...inspectInherited(name, readFileSync(path, "utf8"), hash)!,
      );
  }
  const theme = readFileSync(resolve(root, "src/app/globals.css"), "utf8");
  violations.push(
    ...(inspectInherited(
      "src/app/globals.css",
      theme,
      inherited["src/app/globals.css"],
    ) ?? inspectTheme(theme)),
  );
  return { files: [...files], violations };
}
/** Central theme may define tokens/base styles, never feature-specific selectors. */
export function inspectTheme(css: string): Violation[] {
  const violations: Violation[] = [];
  const allowed = new Set([
    ":root",
    ".dark",
    "@theme inline",
    "@layer base",
    "*",
    "body",
    "button,input,textarea,select",
    "@font-face",
  ]);
  const source = css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/@(?:import|custom-variant)[^;]+;/g, "");
  for (const match of source.matchAll(/([^{}]+)\{/g)) {
    const selector = match[1].trim().replace(/\s*,\s*/g, ",");
    if (!allowed.has(selector))
      violations.push({
        file: "src/app/globals.css",
        line: 1,
        message: `Feature selector in global theme: ${selector}`,
      });
  }
  return violations;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { files, violations } = inspectProject();
  for (const item of violations)
    console.error(`${item.file}:${item.line} ${item.message}`);
  console.log(
    `Console design system: ${files.length} source files, ${violations.length} violations.`,
  );
  if (violations.length) process.exitCode = 1;
}
