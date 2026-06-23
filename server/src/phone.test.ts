import assert from 'node:assert/strict';
import test from 'node:test';
import { extractWhatsappNumber, normalizePhone, splitName } from './phone.js';

test('normalizePhone normalizes digits to E.164', () => {
  assert.equal(normalizePhone('919567509910'), '+919567509910');
  assert.equal(normalizePhone('+91 95675 09910'), '+919567509910');
  assert.equal(normalizePhone('91-9567-509910'), '+919567509910');
  assert.equal(normalizePhone('00966533646134'), '+966533646134');
});

test('normalizePhone rejects implausible input', () => {
  assert.equal(normalizePhone(''), null);
  assert.equal(normalizePhone('12345'), null);
  assert.equal(normalizePhone('not a phone'), null);
  assert.equal(normalizePhone('12345678901234567890'), null);
});

test('extractWhatsappNumber reads the number from the value', () => {
  assert.equal(
    extractWhatsappNumber({ whatsapp_919567509910: '919567509910' }),
    '+919567509910',
  );
});

test('extractWhatsappNumber falls back to the dynamic key', () => {
  assert.equal(extractWhatsappNumber({ whatsapp_919567509910: '' }), '+919567509910');
  assert.equal(extractWhatsappNumber({ whatsapp_919567509910: true }), '+919567509910');
});

test('extractWhatsappNumber returns null when no whatsapp key exists', () => {
  assert.equal(extractWhatsappNumber({ name: 'Priya', phone: '919567509910' }), null);
});

test('splitName splits on the first space, lastname optional', () => {
  assert.deepEqual(splitName('Priya Prahalad'), { firstname: 'Priya', lastname: 'Prahalad' });
  assert.deepEqual(splitName('Priya'), { firstname: 'Priya', lastname: null });
  assert.deepEqual(splitName('A B C'), { firstname: 'A', lastname: 'B C' });
});
