const crypto = require('node:crypto');
console.log(crypto.randomBytes(32).toString('hex'));
