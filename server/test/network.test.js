import test from 'node:test';
import assert from 'node:assert/strict';
import { lanAddresses } from '../src/services/network.js';

test('접속 주소를 http://IP:포트 형태로 만든다', () => {
  for (const url of lanAddresses(4000)) {
    assert.match(url, /^http:\/\/\d+\.\d+\.\d+\.\d+:4000$/);
  }
});

test('루프백 주소는 포함하지 않는다', () => {
  const urls = lanAddresses(4000);
  assert.ok(!urls.some((u) => u.includes('127.0.0.1')));
});
