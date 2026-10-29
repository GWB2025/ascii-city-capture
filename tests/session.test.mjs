import test from 'node:test';
import assert from 'node:assert/strict';
import {CitySession} from '../web/versions.mjs';

test('each city session ignores queued messages from a previous release in the same iframe', () => {
  const iframe = {contentWindow: {postMessage() {}}};
  const session = new CitySession(iframe, 'http://127.0.0.1:43123');
  session.mount('prototype-4-5');
  const event = {origin: session.origin, source: iframe.contentWindow, data: {cityCapture: true, session: session.token}};
  assert.ok(session.accepts(event));
  session.mount('prototype-4');
  assert.match(iframe.src, /^\/city\/prototype-4\/\?capture-session=/);
  assert.equal(session.accepts(event), false);
  assert.ok(session.accepts({...event, data: {...event.data, session: session.token}}));
});

test('messages require the current iframe, origin, and capture session', () => {
  const sent = [];
  const iframe = {contentWindow: {postMessage(...args) {sent.push(args);}}};
  const session = new CitySession(iframe, 'http://127.0.0.1:43123');
  assert.equal(session.accepts({}), false);
  session.mount('prototype-4-5'); session.send('capture');
  const [data, origin] = sent[0];
  assert.equal(data.session, session.token); assert.equal(data.type, 'capture');
  assert.equal(origin, session.origin);
  const valid = {origin, source: iframe.contentWindow, data};
  assert.equal(session.accepts({...valid, origin: 'https://example.com'}), false);
  assert.equal(session.accepts({...valid, source: {}}), false);
  assert.equal(session.accepts({...valid, data: {...data, session: null}}), false);
});
