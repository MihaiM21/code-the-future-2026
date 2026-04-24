import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const exePath = path.join(__dirname, 'src-tauri/target/release/apex.exe');
const icoPath = path.join(__dirname, 'src-tauri/icons/icon.ico');
const rceditPath = path.join(__dirname, 'node_modules/rcedit/bin/rcedit.exe');

if (!fs.existsSync(exePath)) {
  console.error('Executable not found at:', exePath);
  process.exit(1);
}

try {
  execSync(`"${rceditPath}" "${exePath}" --set-icon "${icoPath}"`, { stdio: 'inherit' });
  console.log('✓ Icon embedded in exe successfully!');
} catch (err) {
  console.error('Error setting icon:', err.message);
  process.exit(1);
}
