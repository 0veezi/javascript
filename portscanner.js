const net = require('net');
const readline = require('readline');
const fs = require('fs');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

// Port-Servis eşleştirmeleri
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

// Worker thread kodu
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
}

// Ana program
else {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    console.clear();
    console.log('=== Port Scanner v1.0 ===\n');

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
            const host = await question('Hedef IP adresi: ');
            const startPort = parseInt(await question('Başlangıç portu: '));
            const endPort = parseInt(await question('Bitiş portu: '));

            console.log('\nTarama başlıyor...\n');

            const logStream = fs.createWriteStream(`scan_${host}_${Date.now()}.log`);
            const startTime = Date.now();

            const promises = [];
            for (let port = startPort; port <= endPort; port++) {
                promises.push(scanPort(host, port));
            }

            const results = await Promise.all(promises);
            const openPorts = results.filter(r => r.status === 'open');

            console.log('\nTarama tamamlandı!\n');
            console.log('Açık portlar:');
            
            openPorts.forEach(result => {
                const log = `Port ${result.port}: ${result.service || 'Unknown'}`;
                console.log(log);
                logStream.write(log + '\n');
            });

            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            const summary = `\nToplam taranan port: ${endPort - startPort + 1}\nAçık port sayısı: ${openPorts.length}\nTarama süresi: ${duration} saniye`;
            
            console.log(summary);
            logStream.write(summary);
            logStream.end();

        } catch (error) {
            console.error('Hata:', error);
        } finally {
            rl.close();
        }
    }

    main();
}
