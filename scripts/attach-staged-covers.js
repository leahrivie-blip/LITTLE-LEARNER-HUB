#!/usr/bin/env node
/**
 * Cover-only production attachment for approved staged replacements.
 * Requires ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_ACCESS_CODE in env.
 * Does NOT modify lesson content, ages, titles, IDs, publish state, or TK flags.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const BASE = process.env.LLH_PRODUCTION_BASE || 'https://littlelearnershubbyleah.com';
const PLAN = JSON.parse(fs.readFileSync(
  process.env.ATTACH_PLAN || '/opt/cursor/artifacts/cover-validation/upload-ready/attach-plan.json',
  'utf8'
));

function req(method, urlPath, { token, body, headers } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlPath, BASE);
    const lib = u.protocol === 'https:' ? https : http;
    const payload = body == null ? null : Buffer.from(JSON.stringify(body));
    const opts = {
      method,
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: {
        Accept: 'application/json',
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(headers || {}),
      },
    };
    const r = lib.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(raw); } catch (_) {}
        resolve({ status: res.statusCode, json, raw });
      });
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const accessCode = process.env.ADMIN_ACCESS_CODE;
  if (!email || !password || !accessCode) {
    console.error('Missing ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_ACCESS_CODE');
    process.exit(2);
  }

  console.log('Logging in…');
  const login = await req('POST', '/api/admin/login', {
    body: { email, password, accessCode },
  });
  if (login.status !== 200 || !login.json?.token) {
    console.error('Login failed', login.status, login.json?.error || login.raw.slice(0, 200));
    process.exit(1);
  }
  const token = login.json.token;
  console.log('Login OK');

  const results = [];
  const assignments = [];
  let i = 0;
  for (const row of PLAN.assignments) {
    i += 1;
    const buf = fs.readFileSync(row.uploadPath);
    const b64 = buf.toString('base64');
    const fileData = `data:image/jpeg;base64,${b64}`;
    process.stdout.write(`[${i}/${PLAN.assignments.length}] upload ${row.id}… `);
    const up = await req('POST', '/api/admin/curriculum/lesson-covers/upload', {
      token,
      body: { adminToken: token, fileName: row.fileName, fileData },
    });
    if (up.status !== 200 || !up.json?.url) {
      console.log('FAIL', up.status, up.json?.error || up.raw.slice(0, 160));
      results.push({ id: row.id, title: row.title, ok: false, stage: 'upload', error: up.json?.error || up.raw.slice(0, 200) });
      continue;
    }
    console.log('ok', up.json.url);
    assignments.push({
      id: row.id,
      coverImageUrl: up.json.url,
      coverImageAlt: row.coverImageAlt,
      coverImageSource: 'uploaded',
      coverQualityStatus: 'good',
      coverImagePosition: 'center',
    });
    results.push({ id: row.id, title: row.title, ok: true, stage: 'upload', url: up.json.url, mediaId: up.json.id });
  }

  // Assign in chunks of 50 by stable id only
  const assignResults = [];
  for (let start = 0; start < assignments.length; start += 50) {
    const chunk = assignments.slice(start, start + 50);
    console.log(`Assigning chunk ${start + 1}-${start + chunk.length}…`);
    const asg = await req('POST', '/api/admin/curriculum/lesson-covers/assign', {
      token,
      body: { adminToken: token, assignments: chunk },
    });
    if (asg.status !== 200 || !asg.json?.ok) {
      console.error('Assign failed', asg.status, asg.json || asg.raw.slice(0, 300));
      assignResults.push({ ok: false, start, error: asg.json || asg.raw.slice(0, 300) });
    } else {
      console.log('Assigned', asg.json.updatedCount, 'missing', asg.json.missing);
      assignResults.push({ ok: true, updatedCount: asg.json.updatedCount, missing: asg.json.missing, updated: asg.json.updated });
    }
  }

  const out = {
    at: new Date().toISOString(),
    uploaded: results.filter((r) => r.ok).length,
    uploadFailed: results.filter((r) => !r.ok),
    assignResults,
    keepIdsUntouched: PLAN.keepIds,
  };
  fs.writeFileSync('/opt/cursor/artifacts/cover-validation/upload-ready/attach-results.json', JSON.stringify(out, null, 2));
  console.log('Wrote attach-results.json', { uploaded: out.uploaded, failed: out.uploadFailed.length });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
