import { Pool } from 'pg';
import logger from "../logger";
import { CorvoSong } from "../services/corvo-service";

require('dotenv').config();

const DBConfig = {
    user: String(process.env.PSQL_USER),
    password: String(process.env.PSQL_PASS),
    host: process.env.PSQL_HOST!,
    port: process.env.PSQL_PORT!,
    database: process.env.PSQL_DB!,
    schema: process.env.PSQL_SCHEMA!
}

const poolConfig = {
    user: DBConfig.user,
    password: DBConfig.password,
    host: DBConfig.host,
    port: DBConfig.port,
    database: DBConfig.database,
    max: 20,
    idleTimeoutMillis: 30 * 60 * 1000,
    connectionTimeoutMillis: 5000
}

export class PostgresClient {
    private static instance: PostgresClient;
    private pool: Pool;
    private schema = DBConfig.schema;

    constructor() {
        this.pool = new Pool(poolConfig);

        // Handle pool errors
        this.pool.on('error', (err) => {
            logger.error('Unexpected error on idle client', err);
        });

        logger.info('PostgreSQL pool initialized');
    }

    public static getInstance(): PostgresClient {
        if (!PostgresClient.instance) {
            PostgresClient.instance = new PostgresClient();
        }
        return PostgresClient.instance;
    }

    private async query(sql: string, params: any[] = []): Promise<any> {
        const client = await this.pool.connect();

        try {
            const result = await client.query(sql, params);
            return result.rows;
        } catch (error) {
            logger.error('Database query error:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get all chat configurations
     */
    public async getCorvoSongs(): Promise<CorvoSong[]> {
        const query = `
            SELECT * 
                FROM ${this.schema}.songs_corvo
            ORDER BY id DESC
        `;
        const rows : any[] = await this.query(query, []);

        const corvoSongList: CorvoSong[] = [];

        for (const row of rows) {
            corvoSongList.push({
                song_name: row.song_name,
                song_description: row.song_description,
                song_thumbnail: row.song_thumbnail
            });
        }
        return corvoSongList;
    }

    // For proper application shutdown
    public async close(): Promise<void> {
        await this.pool.end();
        logger.info('PostgreSQL pool has ended');
    }
}