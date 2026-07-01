import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const toolsDir = path.join(__dirname, "..", "src", "tools");

for (const file of fs.readdirSync(toolsDir).filter((f) => f.endsWith(".ts") && f !== "registry.ts")) {
  const filePath = path.join(toolsDir, file);
  let content = fs.readFileSync(filePath, "utf8");

  content = content.replace(/\nexport \{ \w+ \};\s*$/, "\n");
  content = content.replace(/\n\};\s*$/, "\n});\n");

  fs.writeFileSync(filePath, content);
  console.log(`Patched ${file}`);
}
