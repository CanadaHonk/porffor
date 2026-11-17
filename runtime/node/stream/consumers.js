import { Buffer } from '../buffer.js';
import { Blob } from '../internal/blob.js';
import { TextDecoder } from '../internal/encoding.js';

export const blob = async stream => {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return new Blob(chunks);
};

export const arrayBuffer = async stream => (await blob(stream)).arrayBuffer();

export const buffer = async stream => Buffer.from(await arrayBuffer(stream));

export const text = async stream => {
  const decoder = new TextDecoder();
  let str = '';
  for await (const chunk of stream) str += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
  return str + decoder.decode();
};

export const json = async stream => JSON.parse(await text(stream));

export default { arrayBuffer, blob, buffer, json, text };
