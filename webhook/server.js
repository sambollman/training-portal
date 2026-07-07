const http = require('http');
const crypto = require('crypto');
const { exec } = require('child_process');

const SECRET = process.env.WEBHOOK_SECRET || 'change-this-secret';
const PORT = process.env.WEBHOOK_PORT || 9000;
const PROJECT_DIR = '/home/pi/training-portal';

function verify(secret, payload, signature) {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/webhook') {
    res.writeHead(404);
    res.end();
    return;
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    const signature = req.headers['x-hub-signature-256'];
    if (!signature || !verify(SECRET, body, signature)) {
      console.log('Invalid signature');
      res.writeHead(401);
      res.end('Unauthorized');
      return;
    }

    const event = req.headers['x-github-event'];
    if (event !== 'push') {
      res.writeHead(200);
      res.end('OK');
      return;
    }

    const payload = JSON.parse(body);
    if (payload.ref !== 'refs/heads/main') {
      res.writeHead(200);
      res.end('OK');
      return;
    }

    console.log('Push to main detected — deploying...');
    res.writeHead(200);
    res.end('Deploying');

    exec(
      `cd ${PROJECT_DIR} && git pull && docker compose down && docker compose up -d --build`,
      (err, stdout, stderr) => {
        if (err) {
          console.error('Deploy failed:', err);
          console.error(stderr);
        } else {
          console.log('Deploy successful:', stdout);
        }
      }
    );
  });
});

server.listen(PORT, () => {
  console.log(`Webhook server listening on port ${PORT}`);
});
EOF
