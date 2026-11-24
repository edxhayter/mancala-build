// The pieces of the Nostr relay protocol this app needs (add-online-play
// design.md decision 1): where a room lives on the relays, sealing messages
// with the room key, and signing events as relays require. Pure: no sockets.

import { schnorr } from '@noble/secp256k1';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex: string) => Uint8Array.from(hex.match(/../g) ?? [], (h) => parseInt(h, 16));

async function sha256(data: Uint8Array | string): Promise<Uint8Array> {
  const bytes = typeof data === 'string' ? encoder.encode(data) : data;
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource));
}

/** Keeps this app's rooms apart from anything else on the relays. */
const APP = 'mancala-trainer';

/** Where a room lives on the relays: a hash, so relays never see the room name. */
export async function roomTopic(roomKey: string): Promise<string> {
  return toHex(await sha256(`${APP}:${roomKey}`));
}

/**
 * The event kind for a topic. 20000–29999 is Nostr's "ephemeral" range:
 * relays pass these events on to subscribers but don't store them.
 */
export function roomKind(topic: string): number {
  return 20000 + (parseInt(topic.slice(0, 8), 16) % 10000);
}

// --- Sealing: AES-GCM with a key derived from the room key ------------------------

/** The AES key for a room. Slow on purpose (PBKDF2), but done once per room. */
export async function deriveKey(roomKey: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(roomKey), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: encoder.encode(`${APP}:room`), iterations: 100_000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

/** Encrypts any JSON value. A fresh random IV every time, sent in front of the ciphertext. */
export async function seal(key: CryptoKey, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = encoder.encode(JSON.stringify(value));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
  const both = new Uint8Array(iv.length + cipher.length);
  both.set(iv);
  both.set(cipher, iv.length);
  return toBase64(both);
}

/** Decrypts what `seal` made. Null for anything else: wrong key, tampered, or not ours. */
export async function open(key: CryptoKey, text: string): Promise<unknown> {
  try {
    const both = fromBase64(text);
    if (both.length < 13) return null;
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: both.slice(0, 12) }, key, both.slice(12));
    return JSON.parse(decoder.decode(plain));
  } catch {
    return null;
  }
}

// --- Signing: every Nostr event is signed (NIP-01) -----------------------------------

export interface Identity {
  secretKey: Uint8Array;
  /** Hex, 32 bytes: also this tab's PeerId. */
  publicKey: string;
}

export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

/** A throwaway signing key for this tab. */
export function newIdentity(): Identity {
  const { secretKey, publicKey } = schnorr.keygen();
  return { secretKey, publicKey: toHex(publicKey) };
}

/** The event id NIP-01 defines: a hash of the event's fields in a fixed order. */
export async function eventId(event: Omit<NostrEvent, 'id' | 'sig'>): Promise<string> {
  const serial = JSON.stringify([0, event.pubkey, event.created_at, event.kind, event.tags, event.content]);
  return toHex(await sha256(serial));
}

/** A signed event, ready to publish. */
export async function signEvent(identity: Identity, kind: number, tags: string[][], content: string): Promise<NostrEvent> {
  const unsigned = { pubkey: identity.publicKey, created_at: Math.floor(Date.now() / 1000), kind, tags, content };
  const id = await eventId(unsigned);
  const sig = toHex(await schnorr.signAsync(fromHex(id), identity.secretKey));
  return { ...unsigned, id, sig };
}

/** Checks a signature (only tests need this: relays check every event). */
export function verifyEvent(event: NostrEvent): Promise<boolean> {
  return schnorr.verifyAsync(fromHex(event.sig), fromHex(event.id), fromHex(event.pubkey));
}
