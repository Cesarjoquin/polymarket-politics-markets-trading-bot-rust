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

  content = content.replace(
    /\/\/ Will be initialized in index\.ts\nlet shopifyClient: GraphQLClient;\n\n/,
    "",
  );
  content = content.replace(/\nlet shopifyClient: GraphQLClient;\n/, "\n");

  content = content.replace(
    /\n\s*\/\/ Add initialize method[^\n]*\n\s*initialize\(client: GraphQLClient\) \{\n\s*shopifyClient = client;\n\s*\},\n/,
    "\n",
  );
  content = content.replace(
    /\n\s*initialize\(client: GraphQLClient\) \{\n\s*shopifyClient = client;\n\s*\},\n/,
    "\n",
  );

  if (content.includes("createTool({") && !content.trimEnd().endsWith("});")) {
    content = content.replace(/\n\};(\s*)$/, "\n});$1");
  }

  if (!content.includes("createTool")) {
    if (!content.includes('from "../lib/createTool.js"')) {
      content = content.replace(
        /(from "\.\.\/lib\/toolUtils\.js";)/,
        '$1\nimport { createTool } from "../lib/createTool.js";',
      );
    }
    content = content.replace(
      /^export const (\w+) = \{/m,
      "export const $1 = createTool({",
    );
    content = content.replace(
      /^const (\w+) = \{/m,
      "export const $1 = createTool({",
    );
    content = content.replace(/\n\};(\s*)$/, "\n});$1");
    content = content.replace(/\nexport \{ \w+ \};\n?$/, "\n");
  }

  content = content.replace(
    /execute: async \(input(?:: [^)]+)?\) => \{/,
    "execute: async (shopifyClient, input) => {",
  );

  if (
    content.includes('import type { GraphQLClient }') &&
    !content.includes("GraphQLClient") &&
    !content.includes(": GraphQLClient")
  ) {
    content = content.replace(
      /import type \{ GraphQLClient \} from "graphql-request";\n/,
      "",
    );
  }

  fs.writeFileSync(filePath, content);
  console.log(`Fixed ${file}`);
}
