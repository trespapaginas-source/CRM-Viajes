const { Client } = require('pg');
const connectionString = 'postgresql://postgres.qefuqkplornelbzwqgri:3N63sxgIbvtfWhYV@aws-0-us-west-1.pooler.supabase.com:6543/postgres';

async function main() {
    const client = new Client({
        connectionString: connectionString,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        const res = await client.query('SELECT * FROM gastos_corporativos WHERE deleted_at IS NULL ORDER BY fecha DESC');
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (err) {
        console.error('Error querying DB:', err);
    } finally {
        await client.end();
    }
}

main();
