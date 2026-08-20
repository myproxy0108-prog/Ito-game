const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const https = require('https');

const app = express();

const CF_WORKER_URLS = [
    "https://web-itto.myproxy0108.workers.dev/",
    "https://ito.nemu0001.workers.dev/"
];

function getWorkerForUser(ip) {
    const cleanIp = (ip || '').split(',')[0].trim() || 'unknown';
    let hash = 0;
    for (let i = 0; i < cleanIp.length; i++) {
        hash = (hash << 5) - hash + cleanIp.charCodeAt(i);
        hash |= 0;
    }
    const index = Math.abs(hash) % CF_WORKER_URLS.length;
    return CF_WORKER_URLS[index];
}

const proxyAgent = new https.Agent({ 
    keepAlive: false, 
    timeout: 60000 
});

app.get('/healthz', (req, res) => res.status(200).send('OK'));

const proxyMiddleware = createProxyMiddleware({
    router: (req) => {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        return getWorkerForUser(ip);
    },
    changeOrigin: true,
    ws: true,
    agent: proxyAgent,
    
    onProxyReq: (proxyReq, req, res) => {
        const clientHost = req.get('host');
        if (clientHost) {
            proxyReq.setHeader('X-Forwarded-Host', clientHost);
        }
        proxyReq.setHeader('X-Forwarded-Proto', 'https');
        proxyReq.setHeader('Accept-Encoding', 'identity');
    },
    
    onProxyRes: (proxyRes, req, res) => {
        delete proxyRes.headers['content-security-policy'];
        delete proxyRes.headers['x-frame-options'];
        proxyRes.headers['access-control-allow-origin'] = '*';
        proxyRes.headers['access-control-allow-headers'] = '*';
        
        delete proxyRes.headers['content-length'];
        delete proxyRes.headers['content-encoding'];
    },
    
    logLevel: 'error'
});

app.use('/', proxyMiddleware);

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
    console.log(`Cluster Proxy running on port ${PORT}`);
});

server.on('upgrade', (req, socket, head) => {
    proxyMiddleware.upgrade(req, socket, head);
});
