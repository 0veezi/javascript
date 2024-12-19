const net = require('net');
const readline = require('readline');
const fs = require('fs');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

// Language translations
const LANG = {
    tr: {
        welcome: '=== Port Scanner v1.0 ===',
        selectLang: 'Dil seçiniz / Select language (tr/en): ',
        enterIP: 'Hedef IP adresi: ',
        scanOption: 'Tarama seçeneği:\n1. Tüm portları tara\n2. Port aralığı belirle\nSeçiminiz (1-2): ',
        startPort: 'Başlangıç portu: ',
        endPort: 'Bitiş portu: ',
        scanning: 'Taranıyor...',
        scanComplete: 'Tarama tamamlandı!',
        openPorts: 'Açık portlar:',
        total: 'Toplam taranan port:',
        foundPorts: 'Açık port sayısı:',
        duration: 'Tarama süresi:',
        seconds: 'saniye',
        error: 'Hata:'
    },
    en: {
        welcome: '=== Port Scanner v1.0 ===',
        selectLang: 'Select language (tr/en): ',
        enterIP: 'Target IP address: ',
        scanOption: 'Scan option:\n1. Scan all ports\n2. Specify port range\nYour choice (1-2): ',
        startPort: 'Start port: ',
        endPort: 'End port: ',
        scanning: 'Scanning...',
        scanComplete: 'Scan completed!',
        openPorts: 'Open ports:',
        total: 'Total ports scanned:',
        foundPorts: 'Open ports found:',
        duration: 'Scan duration:',
        seconds: 'seconds',
        error: 'Error:'
    }
};

// Port services
const PORT_SERVICES = {
    20: 'FTP Data',
    21: 'FTP Control',
    22: 'SSH',
    23: 'Telnet',
    25: 'SMTP',
    53: 'DNS',
    80: 'HTTP',
    110: 'POP3',
    143: 'IMAP',
    443: 'HTTPS',
    3306: 'MySQL',
    3389: 'RDP'
};

// Progress bar
function updateProgress(current, total, lang) {
    const percentage = Math.floor((current / total) * 100);
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    process.stdout.write(`${LANG[lang].scanning} ${percentage}% (${current}/${total})`);
}

if (!isMainThread) {
    const { host, port } = workerData;
    const socket = new net.Socket();
    socket.setTimeout(1000);
    
    socket.on('connect', () => {
        parentPort.postMessage({ port, status: 'open', service: PORT_SERVICES[port] || 'Unknown' });
        socket.destroy();
    });
    
    socket.on('error', () => {
        parentPort.postMessage({ port, status: 'closed' });
    });
    
    socket.on('timeout', () => {
        socket.destroy();
        parentPort.postMessage({ port, status: 'closed' });
    });
    
    socket.connect(port, host);
} else {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    async function question(query) {
        return new Promise(resolve => rl.question(query, resolve));
    }

    async function scanPort(host, port) {
        return new Promise((resolve) => {
            const worker = new Worker(__filename, {
                workerData: { host, port }
            });
            worker.on('message', resolve);
            worker.on('error', () => resolve({ port, status: 'error' }));
        });
    }

    async function main() {
        try {
            console.clear();
            console.log('=== Port Scanner v1.0 ===\n');
            
            const lang = (await question(LANG.tr.selectLang)).toLowerCase();
            if (!LANG[lang]) process.exit(1);

            const host = await question(LANG[lang].enterIP);
            const scanOption = await question(LANG[lang].scanOption);

            let startPort = 1;
            let endPort = 65535;

            if (scanOption === '2') {
                startPort = parseInt(await question(LANG[lang].startPort));
                endPort = parseInt(await question(LANG[lang].endPort));
            }

            console.log('\n');
            const logStream = fs.createWriteStream(`scan_${host}_${Date.now()}.log`);
            const startTime = Date.now();
            let scannedPorts = 0;
            const openPorts = [];

            for(let currentPort = startPort; currentPort <= endPort; currentPort += 1000) {
                const endChunk = Math.min(currentPort + 999, endPort);
                const promises = [];
                
                for(let port = currentPort; port <= endChunk; port++) {
                    promises.push(scanPort(host, port));
                }

                const results = await Promise.all(promises);
                results.forEach(result => {
                    if(result.status === 'open') {
                        openPorts.push(result);
                    }
                });

                scannedPorts += promises.length;
                updateProgress(scannedPorts, endPort, lang);
            }

            console.log(`\n\n${LANG[lang].scanComplete}\n`);
            console.log(`${LANG[lang].openPorts}`);
            
            openPorts.forEach(result => {
                const log = `Port ${result.port}: ${result.service || 'Unknown'}`;
                console.log(log);
                logStream.write(log + '\n');
            });

            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            const summary = `\n${LANG[lang].total} ${endPort - startPort + 1}\n${LANG[lang].foundPorts} ${openPorts.length}\n${LANG[lang].duration} ${duration} ${LANG[lang].seconds}`;
            
            console.log(summary);
            logStream.write(summary);
            logStream.end();

        } catch (error) {
            console.error(`${LANG[lang].error}`, error);
        } finally {
            rl.close();
        }
    }

    main();
}
