import os from 'node:os';

/**
 * 같은 네트워크의 다른 기기에서 접속할 수 있는 주소 목록.
 * 내부 루프백과 IPv6 는 제외하고, 사설망 대역을 앞으로 정렬한다.
 */
export function lanAddresses(port) {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' && entry.family !== 4) continue;
      if (entry.internal) continue;
      addresses.push(entry.address);
    }
  }

  return addresses
    .sort((a, b) => Number(isPrivate(b)) - Number(isPrivate(a)))
    .map((address) => `http://${address}:${port}`);
}

/** 가정용 공유기가 나눠주는 사설 IP 대역인지 */
function isPrivate(address) {
  return (
    address.startsWith('192.168.') ||
    address.startsWith('10.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(address)
  );
}
