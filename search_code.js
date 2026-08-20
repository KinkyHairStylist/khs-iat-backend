const fs = require('fs');
const path = require('path');

const searchDir = path.join(__dirname, '../khs-iat-frontend');

function search(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (file !== 'node_modules' && file !== '.next') {
        search(fullPath);
      }
    } else {
      if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.jsx')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        if (content.includes('noBusiness')) {
          console.log(`Found in: ${fullPath}`);
          // Print surrounding lines
          const lines = content.split('\n');
          lines.forEach((line, idx) => {
            if (line.includes('noBusiness')) {
              console.log(`${idx + 1}: ${line.trim()}`);
            }
          });
        }
      }
    }
  }
}

search(searchDir);
