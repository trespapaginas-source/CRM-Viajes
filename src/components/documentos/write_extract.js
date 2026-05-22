const fs = require('fs');
const readline = require('readline');
const path = require('path');

async function extract() {
    const fileStream = fs.createReadStream('C:/Users/Usuario/.gemini/antigravity-ide/brain/d1fb862a-7292-4ce0-9092-0d9b281e5166/.system_generated/logs/transcript.jsonl');
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    for await (const line of rl) {
        try {
            const data = JSON.parse(line);
            if (data.step_index === 311) {
                if (data.tool_calls && data.tool_calls[0]) {
                    const args = data.tool_calls[0].args;
                    if (args) {
                        const targetDir = 'C:/Users/Usuario/.gemini/antigravity-ide/brain/d1fb862a-7292-4ce0-9092-0d9b281e5166/scratch';
                        
                        // Parse JSON strings inside the args
                        const targetContent = JSON.parse(args.TargetContent);
                        const replacementContent = JSON.parse(args.ReplacementContent);
                        
                        fs.writeFileSync(path.join(targetDir, 'extracted_target.txt'), targetContent, 'utf8');
                        fs.writeFileSync(path.join(targetDir, 'extracted_replacement.txt'), replacementContent, 'utf8');
                        
                        console.log("Successfully wrote target and replacement contents to scratch files!");
                        return;
                    }
                }
            }
        } catch (e) {
            console.error("Parse error:", e);
        }
    }
}

extract();
