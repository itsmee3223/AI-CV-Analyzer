import 'dotenv/config';
import { DataSource, DataSourceOptions } from 'typeorm';

// TAMBAHKAN BARIS INI UNTUK MELIHAT NILAINYA
console.log('DATABASE_URL yang terbaca:', process.env.DATABASE_URL);

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/database/migrations/*.ts'],
  migrationsTableName: 'migrations',
};

const dataSource = new DataSource(dataSourceOptions);
export default dataSource;
