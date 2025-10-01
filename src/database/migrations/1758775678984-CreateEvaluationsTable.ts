import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEvaluationsTable1758775678984 implements MigrationInterface {
  name = 'CreateEvaluationsTable1758775678984';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."evaluations_status_enum" AS ENUM('uploaded', 'queued', 'processing', 'completed', 'failed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "evaluations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "status" "public"."evaluations_status_enum" NOT NULL DEFAULT 'queued', "cv_url" character varying NOT NULL, "project_report_url" character varying NOT NULL, "result" jsonb, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_f683b433eba0e6dae7e19b29e29" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "evaluations"`);
    await queryRunner.query(`DROP TYPE "public"."evaluations_status_enum"`);
  }
}
