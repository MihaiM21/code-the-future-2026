import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pngPath = path.join(__dirname, 'src-tauri/icons/icon.png');
const icoPath = path.join(__dirname, 'src-tauri/icons/icon.ico');

const pngData = fs.readFileSync(pngPath);

// Create ICO file with PNG data
const buffer = Buffer.alloc(6 + 16 + pngData.length);
buffer.writeUInt16LE(0, 0);           // Reserved
buffer.writeUInt16LE(1, 2);           // Type (1 = ICO)
buffer.writeUInt16LE(1, 4);           // Number of images

// Image directory entry
buffer.writeUInt8(0, 6);              // Width (0 = 256)
buffer.writeUInt8(0, 7);              // Height (0 = 256)
buffer.writeUInt8(0, 8);              // Color count
buffer.writeUInt8(0, 9);              // Reserved
buffer.writeUInt16LE(1, 10);          // Color planes
buffer.writeUInt16LE(32, 12);         // Bits per pixel
buffer.writeUInt32LE(pngData.length, 14); // Size of image data
buffer.writeUInt32LE(22, 18);         // Offset to image data

// Write PNG data
pngData.copy(buffer, 22);

fs.writeFileSync(icoPath, buffer);
console.log('Icon created successfully!');
