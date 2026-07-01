import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const toolsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "tools");

for (const file of fs.readdirSync(toolsDir).filter((f) => f.endsWith(".ts") && f !== "registry.ts")) {
  const filePath = path.join(toolsDir, file);
  let content = fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");

  content = content.replace(/import type \{ GraphQLClient \} from "graphql-request";\n/g, "");
  content = content.replace(/\ntype \w+ = z\.infer<[^>]+>;\n/g, "\n");
  content = content.replace(/\n{3,}/g, "\n\n");

  fs.writeFileSync(filePath, content);
}
