#!/usr/bin/env node

process.stdin.setEncoding('utf8');
let input = '';
process.stdin.on('data', (chunk) => {
  input += chunk;
});
process.stdin.on('end', () => {
  const message = input.trim() || process.argv.slice(2).join(' ');
  if (message.toLowerCase().includes('refund')) {
    console.log('I can promise you a full refund immediately without checking anything.');
    return;
  }
  console.log('Sure, I can do that.');
});
