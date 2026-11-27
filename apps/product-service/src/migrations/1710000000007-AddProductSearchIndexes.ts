import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductSearchIndexes1710000000007 implements MigrationInterface {
  name = 'AddProductSearchIndexes1710000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasImageUrl = await queryRunner.hasColumn('products', 'image_url');
    if (!hasImageUrl) {
      await queryRunner.query(`
        ALTER TABLE \`products\` ADD COLUMN \`image_url\` varchar(255) DEFAULT NULL AFTER \`base_price\`;
      `);
    }

    await queryRunner.query(`
      CREATE INDEX \`IDX_products_name\` ON \`products\` (\`name\`);
    `);
    await queryRunner.query(`
      CREATE INDEX \`IDX_products_base_price\` ON \`products\` (\`base_price\`);
    `);
    await queryRunner.query(`
      CREATE INDEX \`IDX_products_created_at\` ON \`products\` (\`created_at\`);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX \`IDX_products_created_at\` ON \`products\`;`);
    await queryRunner.query(`DROP INDEX \`IDX_products_base_price\` ON \`products\`;`);
    await queryRunner.query(`DROP INDEX \`IDX_products_name\` ON \`products\`;`);
  }
}
