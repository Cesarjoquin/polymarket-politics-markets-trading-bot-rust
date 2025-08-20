import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('=== MCP SDK Diagnostic (ES Module) ===\n');

const sdkPath = path.join(__dirname, 'node_modules', '@modelcontextprotocol', 'sdk');

try {
  // Check package.json
  const packageJson = JSON.parse(fs.readFileSync(path.join(sdkPath, 'package.json'), 'utf8'));
  console.log('Package version:', packageJson.version);
  console.log('Main entry:', packageJson.main);
  console.log('Type:', packageJson.type);
  console.log('Exports:', JSON.stringify(packageJson.exports, null, 2));
  console.log('');

  // Check directory structure
  console.log('SDK directory contents:');
  const contents = fs.readdirSync(sdkPath);
  contents.forEach(item => {
    const itemPath = path.join(sdkPath, item);
    const isDir = fs.statSync(itemPath).isDirectory();
    console.log(`  ${item}${isDir ? '/' : ''}`);
    
    if (isDir && ['dist', 'lib', 'src', 'client', 'server'].includes(item)) {
      console.log(`    Contents of ${item}:`);
      try {
        const subContents = fs.readdirSync(itemPath);
        subContents.slice(0, 10).forEach(subItem => {
          console.log(`      ${subItem}`);
        });
        if (subContents.length > 10) {
          console.log(`      ... and ${subContents.length - 10} more files`);
        }
      } catch (e) {
        console.log(`      Error reading ${item}: ${e.message}`);
      }
    }
  });

  console.log('\n=== Testing ES Module imports ===');

  // Test different import methods
  const importTests = [
    { name: 'Main package', path: '@modelcontextprotocol/sdk' },
    { name: 'Client', path: '@modelcontextprotocol/sdk/client' },
    { name: 'Client index', path: '@modelcontextprotocol/sdk/client/index.js' },
    { name: 'Client stdio', path: '@modelcontextprotocol/sdk/client/stdio.js' },
    { name: 'Dist client', path: '@modelcontextprotocol/sdk/dist/client/index.js' },
    { name: 'Dist stdio', path: '@modelcontextprotocol/sdk/dist/client/stdio.js' },
  ];

  for (const test of importTests) {
    try {
      const module = await import(test.path);
      console.log(`${test.name}: SUCCESS`);
      console.log(`  Available exports: ${Object.keys(module).join(', ')}`);
      if (module.default) {
        console.log(`  Default export keys: ${Object.keys(module.default).join(', ')}`);
      }
    } catch (error) {
      console.log(`${test.name}: FAILED - ${error.message}`);
    }
  }

} catch (error) {
  console.error('Error during diagnosis:', error.message);
}