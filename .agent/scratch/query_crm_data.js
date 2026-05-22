const supabaseUrl = 'https://qefuqkplornelbzwqgri.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFlZnVxa3Bsb3JuZWxiendxZ3JpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4MDkzMTUsImV4cCI6MjA4ODM4NTMxNX0.nqTpWWq0wJXrY-JynUz_oPUEGaMhVbTK1dOBBq3p9rs';

async function main() {
    try {
        console.log("--- FETCHING ALL PLANES ---");
        const resPlanes = await fetch(`${supabaseUrl}/rest/v1/planes?select=id,nombre,tipo,fechas,fecha_entrada,fecha_salida`, {
            headers: {
                'apikey': supabaseAnonKey,
                'Authorization': `Bearer ${supabaseAnonKey}`
            }
        });
        const planes = await resPlanes.json();
        console.log(JSON.stringify(planes, null, 2));

        console.log("\n--- FETCHING ALL CLIENTES ---");
        const resClientes = await fetch(`${supabaseUrl}/rest/v1/clientes?select=*`, {
            headers: {
                'apikey': supabaseAnonKey,
                'Authorization': `Bearer ${supabaseAnonKey}`
            }
        });
        const clientes = await resClientes.json();
        console.log("Total clientes:", clientes.length);
        if (clientes.length > 0) {
            console.log(JSON.stringify(clientes.slice(0, 5), null, 2));
        }
    } catch (e) {
        console.error(e);
    }
}
main();
