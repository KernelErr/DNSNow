const https = require('https');

const cloudflareOptions = {
    headers:{
        'Accept': 'application/dns-json'
    }
};

const get = url => new Promise(resolve =>
  https.get(url, cloudflareOptions, resolve));

const readStream = stream => {
  const buffer = [];
  return new Promise((resolve, reject) => {
    stream
      .on('error', reject)
      .on('data', chunk => {
        buffer.push(chunk)
      })
      .on('end', () => resolve(Buffer.concat(buffer)));
  });
};

const resolve = (name, type = 'ANY') => {
  return Promise
    .resolve()
    .then(() => get(`https://cloudflare-dns.com/dns-query?name=${name}&type=${type}`))
    .then(readStream)
    .then(JSON.parse)
};

module.exports = resolve;