const fs = require('fs');
const path = require('path');

// Simple ICO file creation from PNG using sharp
const sharp = require('sharp');

const pngPath = path.join(__dirname, 'src-tauri/icons/icon.png');
const icoPath = path.join(__dirname, 'src-tauri/icons/icon.ico');

// Resize PNG to 256x256 and convert to ICO format
sharp(pngPath)
  .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 1 } })
  .toBuffer()
  .then(data => {
    // Create a simple ICO file header for 256x256 image
    const buffer = Buffer.alloc(6 + 16 + data.length);
    buffer.writeUInt16LE(0, 0);      // Reserved
    buffer.writeUInt16LE(1, 2);      // Type (1 = ICO)
    buffer.writeUInt16LE(1, 4);      // Number of images

    // Image directory entry
    buffer.writeUInt8(256, 6);       // Width (0 = 256)
    buffer.writeUInt8(256, 7);       // Height (0 = 256)
    buffer.writeUInt8(0, 8);         // Color count
    buffer.writeUInt8(0, 9);         // Reserved
    buffer.writeUInt16LE(1, 10);     // Color planes
    buffer.writeUInt16LE(32, 12);    // Bits per pixel
    buffer.writeUInt32LE(data.length, 14); // Size
    buffer.writeUInt32LE(22, 18);    // Offset

    // Write image data
    data.copy(buffer, 22);

    fs.writeFileSync(icoPath, buffer);
    console.log('Icon converted successfully!');
  })
  .catch(err => {
    console.error('Error converting icon:', err);
    process.exit(1);
  });
