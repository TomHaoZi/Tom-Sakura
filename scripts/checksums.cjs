const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const folder = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname,'../release',require('../package.json').version);
const files = fs.readdirSync(folder).filter(name => /^Tom Sakura-.*-x64-(?:Setup|Portable)\.exe$/.test(name)).sort();
if (!files.length) throw new Error('No release executables found');
(async()=>{
  const lines=[];
  for(const file of files) {
    const hash=crypto.createHash('sha256');
    for await (const chunk of fs.createReadStream(path.join(folder,file))) hash.update(chunk);
    lines.push(`${hash.digest('hex')}  ${file}`);
  }
  fs.writeFileSync(path.join(folder,'SHA256SUMS.txt'),lines.join('\n')+'\n');
  console.log('Release SHA-256 checksums created for',files.length,'executables');
})();
