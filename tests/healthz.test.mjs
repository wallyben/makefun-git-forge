import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';

test('official grader healthz responds twice without authentication', async () => {
  const child = spawn(process.execPath, ['main.ts'], {
    cwd: process.cwd(),
    env: {...process.env, MAKEFUN_ENV_URL: '', MAKEFUN_SHOP_TOKEN: 'test-secret'},
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('server startup timeout: ' + output)), 8000);
    child.stdout.on('data', chunk => {
      output += chunk.toString();
      const match = /Git forge listening on (\d+)/.exec(output);
      if (match) {clearTimeout(timeout); resolve(Number(match[1]));}
    });
    child.stderr.on('data', chunk => {output += chunk.toString()});
    child.once('error', err => {clearTimeout(timeout); reject(err)});
    child.once('exit', code => {clearTimeout(timeout); reject(new Error('server exited ' + code + ': ' + output))});
  }).catch(err => {child.kill(); throw err});
  try {
    for (let n = 0; n < 2; n++) {
      const response = await fetch('http://127.0.0.1:' + port + '/healthz');
      assert.equal(response.status, 200);
      assert.equal(await response.text(), 'ok');
    }
  } finally {
    child.kill();
  }
});
