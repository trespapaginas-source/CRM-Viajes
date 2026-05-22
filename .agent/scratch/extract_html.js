const fs = require('fs');
const readline = require('readline');

async function run() {
    const logPath = 'C:\\Users\\Usuario\\.gemini\\antigravity-ide\\brain\\d1fb862a-7292-4ce0-9092-0d9b281e5166\\.system_generated\\logs\\transcript.jsonl';
    const rl = readline.createInterface({
        input: fs.createReadStream(logPath),
        crlfDelay: Infinity
    });

    for await (const line of rl) {
        const obj = JSON.parse(line);
        if (obj.step_index === 260) {
            fs.writeFileSync('c:\\Users\\Usuario\\Downloads\\CRM-Viajes- (2)\\test\\.agent\\scratch\\extracted_soporte.html', obj.content || '');
            console.log("HTML extracted to c:\\Users\\Usuario\\Downloads\\CRM-Viajes- (2)\\test\\.agent\\scratch\\extracted_soporte.html");
            break;
        }
    }
}
run();
