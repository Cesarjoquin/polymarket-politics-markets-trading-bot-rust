/**
 * One-time migration helper: converts legacy tool modules to createTool factory.
 * Run with: node scripts/migrate-tools.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const toolsDir = path.join(__dirname, "..", "src", "tools");

const files = fs
  .readdirSync(toolsDir)
  .filter((f) => f.endsWith(".ts") && f !== "registry.ts");

for (const file of files) {
  const filePath = path.join(toolsDir, file);
  let content = fs.readFileSync(filePath, "utf8");

  if (content.includes("createTool")) {
    continue;
  }

  if (!content.includes("let shopifyClient")) {
    console.log(`Skipping ${file} — no shopifyClient pattern`);
    continue;
  }

  // Add createTool import after toolUtils import
  if (!content.includes("createTool")) {
    content = content.replace(
      /from "\.\.\/lib\/toolUtils\.js";/,
      'from "../lib/toolUtils.js";\nimport { createTool } from "../lib/createTool.js";',
    );
    if (!content.includes("createTool")) {
      content = content.replace(
        /from '\.\.\/lib\/toolUtils\.js';/,
        "from '../lib/toolUtils.js';\nimport { createTool } from '../lib/createTool.js';",
      );
    }
  }

  content = content.replace(
    /\/\/ Will be initialized in index\.ts\nlet shopifyClient: GraphQLClient;\n\n/,
    "",
  );
  content = content.replace(/\nlet shopifyClient: GraphQLClient;\n/, "\n");

  // Match const toolName = { or export const
  content = content.replace(
    /^(const \w+ = \{|export const \w+ = \{)/m,
    "export const $1".replace("export const export const", "export const"),
  );

  // Fix double export
  content = content.replace(
    /export const (const \w+ = \{)/,
    "export $1",
  );

  const constMatch = content.match(/^export const (\w+) = \{/m);
  if (!constMatch) {
    const altMatch = content.match(/^const (\w+) = \{/m);
    if (altMatch) {
      content = content.replace(
        `const ${altMatch[1]} = {`,
        `export const ${altMatch[1]} = createTool({`,
      );
    }
  } else {
    content = content.replace(
      `export const ${constMatch[1]} = {`,
      `export const ${constMatch[1]} = createTool({`,
    );
  }

  // Remove initialize block
  content = content.replace(
    /\n\s*\/\/ Add initialize method[^\n]*\n\s*initialize\(client: GraphQLClient\) \{\n\s*shopifyClient = client;\n\s*\},\n/,
    "\n",
  );
  content = content.replace(
    /\n\s*initialize\(client: GraphQLClient\) \{\n\s*shopifyClient = client;\n\s*\},\n/,
    "\n",
  );

  // Change execute signature
  content = content.replace(
    /execute: async \(input(?:: [^)]+)?\) => \{/,
    "execute: async (shopifyClient, input) => {",
  );

  // Close createTool call - replace final }; with });
  content = content.replace(/\n\};\n\nexport \{ \w+ \};/, "\n});\n");
  content = content.replace(/\n\};\n$/, "\n});\n");

  // Remove separate export { x };
  content = content.replace(/\nexport \{ \w+ \};\n?$/, "\n");

  // Remove unused GraphQLClient import if only used for let
  if (!content.match(/GraphQLClient[^;]*;/)) {
    content = content.replace(
      /import type \{ GraphQLClient \} from "graphql-request";\n/,
      "",
    );
  }

  fs.writeFileSync(filePath, content);
  console.log(`Migrated ${file}`);
}

console.log("Done.");
