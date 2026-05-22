// Node 18+ has global fetch
async function run() {
    const supabaseUrl = 'https://qefuqkplornelbzwqgri.supabase.co';
    const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFlZnVxa3Bsb3JuZWxiendxZ3JpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4MDkzMTUsImV4cCI6MjA4ODM4NTMxNX0.nqTpWWq0wJXrY-JynUz_oPUEGaMhVbTK1dOBBq3p9rs';
    
    console.log("Checking for 'cotizaciones' table...");
    try {
        const res = await fetch(`${supabaseUrl}/rest/v1/cotizaciones?select=*&limit=1`, {
            method: 'GET',
            headers: {
                'apikey': supabaseAnonKey,
                'Authorization': `Bearer ${supabaseAnonKey}`
            }
        });
        console.log(`Status: ${res.status}`);
        const text = await res.text();
        console.log(`Response: ${text}`);
    } catch (err) {
        console.error(err);
    }
}
run();
