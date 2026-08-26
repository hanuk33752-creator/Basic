import test from 'node:test';
import assert from 'node:assert/strict';
import { chromiumCandidates } from '../src/services/browser.js';

const WINDOWS_ENV = {
  ProgramFiles: 'C:\\Program Files',
  'ProgramFiles(x86)': 'C:\\Program Files (x86)',
  LOCALAPPDATA: 'C:\\Users\\hong\\AppData\\Local',
};

test('윈도우 브라우저 후보 경로를 만든다', () => {
  const paths = chromiumCandidates(WINDOWS_ENV);
  assert.equal(paths[0], 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe');
  assert.equal(paths[1], 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe');
  assert.ok(paths.includes('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'));
  assert.ok(paths.includes('C:\\Users\\hong\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'));
  assert.equal(paths.length, 5);
});

test('Edge 를 Chrome 보다 먼저 찾는다', () => {
  const paths = chromiumCandidates(WINDOWS_ENV);
  const firstEdge = paths.findIndex((p) => p.includes('msedge.exe'));
  const firstChrome = paths.findIndex((p) => p.includes('chrome.exe'));
  assert.ok(firstEdge < firstChrome);
});

test('환경 변수가 없으면 그 후보는 건너뛴다', () => {
  assert.deepEqual(chromiumCandidates({}), []);
  const onlyLocal = chromiumCandidates({ LOCALAPPDATA: 'C:\\Users\\hong\\AppData\\Local' });
  assert.equal(onlyLocal.length, 1);
  assert.ok(onlyLocal[0].endsWith('chrome.exe'));
});
