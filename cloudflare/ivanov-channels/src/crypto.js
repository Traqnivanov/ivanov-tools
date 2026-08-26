function decodeBase64(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function encodeBase64(bytes) {
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

async function encryptionKey(secret) {
  const bytes = decodeBase64(secret);
  if (bytes.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.');
  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptText(value, secret) {
  const key = await encryptionKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(value),
  );
  return {
    ciphertext: encodeBase64(new Uint8Array(encrypted)),
    iv: encodeBase64(iv),
  };
}

export async function decryptText(ciphertext, iv, secret) {
  const key = await encryptionKey(secret);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: decodeBase64(iv) },
    key,
    decodeBase64(ciphertext),
  );
  return new TextDecoder().decode(plain);
}
