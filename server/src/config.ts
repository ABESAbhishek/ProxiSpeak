import dotenv from 'dotenv';
import path from 'node:path';

// Resolve relative to the server package for both ts-node (src) and compiled dist runs.
dotenv.config({ path: path.resolve(__dirname, '../.env') });
