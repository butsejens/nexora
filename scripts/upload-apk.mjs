import { createReadStream, statSync } from 'fs';
import { execSync } from 'child_process';
import https from 'https';

const token = execSync('gh auth token').toString().trim();
const apkPath = 'releases/nexora-v2.6.34.apk';
const size = statSync(apkPath).size;
console.log('APK size:', size, 'bytes');

const options = {
  hostname: 'uploads.github.com',
  path: '/repos/butsejens/nexora/releases/304766966/assets?name=nexora-v2.6.34.apk',
  method: 'POST',
  headers: {
    'Authorization': `token ${token}`,
    'Content-Type': 'application/vnd.android.package-archive',
    'Content-Length': size,
    'User-Agent': 'nexora-upload'
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('HTTP Status:', res.statusCode);
    try {
      const json = JSON.parse(data);
      console.log('Asset name:', json.name);
      console.log('Asset size:', json.size);
      console.log('Asset state:', json.state);
      console.log('URL:', json.browser_download_url);
    } catch (e) {
      console.log('Response:', data.slice(0, 500));
    }
  });
});

req.on('error', (e) => {
  console.error('Upload error:', e.message);
});

// Stream the file instead of loading into memory
const stream = createReadStream(apkPath);
let uploaded = 0;
stream.on('data', (chunk) => {
  uploaded += chunk.length;
  const pct = ((uploaded / size) * 100).toFixed(1);
  process.stdout.write(`\rUploading: ${pct}%`);
});
stream.pipe(req);
console.log('Upload started (streaming)...');
