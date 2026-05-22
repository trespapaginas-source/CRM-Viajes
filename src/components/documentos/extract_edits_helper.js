const fs = require('fs');
const readline = require('readline');

async function extract() {
    const fileStream = fs.createReadStream('C:/Users/Usuario/.gemini/antigravity-ide/brain/d1fb862a-7292-4ce0-9092-0d9b281e5166/.system_generated/logs/transcript.jsonl');
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    for await (const line of rl) {
        try {
            const data = JSON.parse(line);
            if (data.step_index === 311 || data.step_index === 368) {
                console.log(`=== Step ${data.step_index} (${data.type}) ===`);
                console.log(JSON.stringify(data, null, 2));
                console.log("=====================================\n");
            }
        } catch (e) {
            // Ignore parse errors
        }
    }
}

extract();
