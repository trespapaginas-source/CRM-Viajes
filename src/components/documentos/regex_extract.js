const fs = require('fs');
const path = require('path');

function extract() {
    const rawContent = fs.readFileSync('C:/Users/Usuario/.gemini/antigravity-ide/brain/d1fb862a-7292-4ce0-9092-0d9b281e5166/.system_generated/logs/transcript.jsonl', 'utf8');
    const lines = rawContent.split('\n');
    
    for (const line of lines) {
        if (line.includes('"step_index":311') || line.includes('"step_index": 311')) {
            console.log("Found line for step 311!");
            
            // Find "TargetContent": "..."
            const targetKey = '"TargetContent":';
            const targetIdx = line.indexOf(targetKey);
            if (targetIdx !== -1) {
                // Find start and end quote of value
                const startQuote = line.indexOf('"', targetIdx + targetKey.length);
                // Find matching end quote. Since the string might contain escaped quotes \", we need to skip them.
                let endQuote = startQuote + 1;
                while (endQuote < line.length) {
                    if (line[endQuote] === '"' && line[endQuote - 1] !== '\\') {
                        break;
                    }
                    endQuote++;
                }
                const targetValRaw = line.slice(startQuote + 1, endQuote);
                // Unescape backslashes, quotes, and newlines
                const targetVal = targetValRaw
                    .replace(/\\"/g, '"')
                    .replace(/\\n/g, '\n')
                    .replace(/\\\\/g, '\\');
                
                fs.writeFileSync('C:/Users/Usuario/.gemini/antigravity-ide/brain/d1fb862a-7292-4ce0-9092-0d9b281e5166/scratch/extracted_target.txt', targetVal, 'utf8');
                console.log("Wrote target content!");
            }
            
            // Find "ReplacementContent": "..."
            const replaceKey = '"ReplacementContent":';
            const replaceIdx = line.indexOf(replaceKey);
            if (replaceIdx !== -1) {
                const startQuote = line.indexOf('"', replaceIdx + replaceKey.length);
                let endQuote = startQuote + 1;
                while (endQuote < line.length) {
                    if (line[endQuote] === '"' && line[endQuote - 1] !== '\\') {
                        break;
                    }
                    endQuote++;
                }
                const replaceValRaw = line.slice(startQuote + 1, endQuote);
                const replaceVal = replaceValRaw
                    .replace(/\\"/g, '"')
                    .replace(/\\n/g, '\n')
                    .replace(/\\\\/g, '\\');
                
                fs.writeFileSync('C:/Users/Usuario/.gemini/antigravity-ide/brain/d1fb862a-7292-4ce0-9092-0d9b281e5166/scratch/extracted_replacement.txt', replaceVal, 'utf8');
                console.log("Wrote replacement content!");
            }
            return;
        }
    }
}

extract();
