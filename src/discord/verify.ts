function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

export async function verifyDiscordSignature(
  publicKeyHex: string,
  signatureHex: string,
  timestamp: string,
  body: string,
): Promise<boolean> {
  try {
    if (!publicKeyHex || !signatureHex || !timestamp || typeof body !== 'string') {
      return false;
    }
    if (signatureHex.length !== 128) {
      return false;
    }

    const pubKeyBytes = hexToUint8Array(publicKeyHex);
    const sigBytes = hexToUint8Array(signatureHex);
    const enc = new TextEncoder();
    const messageBytes = enc.encode(timestamp + body);

    let key: CryptoKey;
    try {
      key = await crypto.subtle.importKey(
        'raw',
        pubKeyBytes,
        { name: 'NODE-ED25519', namedCurve: 'NODE-ED25519' },
        false,
        ['verify'],
      );
    } catch {
      key = await crypto.subtle.importKey('raw', pubKeyBytes, { name: 'Ed25519' }, false, [
        'verify',
      ]);
    }

    return await crypto.subtle.verify(key.algorithm.name, key, sigBytes, messageBytes);
  } catch {
    return false;
  }
}
