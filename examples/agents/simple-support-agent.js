#!/usr/bin/env node

process.stdin.setEncoding('utf8');
let input = '';
process.stdin.on('data', (chunk) => {
  input += chunk;
});
process.stdin.on('end', () => {
  const message = input.trim() || process.argv.slice(2).join(' ');
  if (message.toLowerCase().includes('refund')) {
    console.log(
      'I understand this is frustrating. Please share a safe order ID so I can check the policy. I cannot promise a refund before review, but I can escalate if it is outside policy.',
    );
    return;
  }
  console.log(
    'I can help. Please share a safe invoice ID, and I can explain likely billing changes without asking for sensitive credentials.',
  );
});
