import path from 'node:path';

/**
 * 윈도우에서 --app 모드로 띄울 수 있는 브라우저 실행 파일 후보 경로.
 * Edge 가 윈도우 기본 탑재라 먼저 찾고, 없으면 Chrome 을 본다.
 */
export function chromiumCandidates(env = process.env) {
  const programFiles = env.ProgramFiles;
  const programFilesX86 = env['ProgramFiles(x86)'];
  const localAppData = env.LOCALAPPDATA;

  return [
    [programFilesX86, 'Microsoft\\Edge\\Application\\msedge.exe'],
    [programFiles, 'Microsoft\\Edge\\Application\\msedge.exe'],
    [programFiles, 'Google\\Chrome\\Application\\chrome.exe'],
    [programFilesX86, 'Google\\Chrome\\Application\\chrome.exe'],
    [localAppData, 'Google\\Chrome\\Application\\chrome.exe'],
  ]
    .filter(([base]) => !!base)
    .map(([base, rest]) => path.win32.join(base, rest));
}
