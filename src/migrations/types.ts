/**
 * Migrations repository types
 */

/**
 * Record of an applied migration
 */
export interface MigrationRecord {
	/** Primary key */
	id: number;
	/** Migration name (e.g. filename or migration name) */
	name: string;
	/** Batch number (increments per run) */
	batch: number;
	/** When the migration was applied (ISO timestamp) */
	applied_at: string;
}
